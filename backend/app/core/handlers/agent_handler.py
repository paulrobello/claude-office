"""Handler for agent lifecycle events.

Covers: SUBAGENT_START, SUBAGENT_INFO, SUBAGENT_STOP, and AGENT_UPDATE.

Responsibilities:
- Enriching agent metadata via the summary service.
- Starting / stopping per-agent transcript polling.
- Synthesising SUBAGENT_START events for ghost agents discovered after a
  backend restart.
- Removing agents from the StateMachine on SUBAGENT_STOP.
"""

import logging
from collections.abc import Awaitable, Callable
from typing import Any

from app.core.broadcast_service import broadcast_state
from app.core.jsonl_parser import get_first_user_prompt, get_last_assistant_response
from app.core.state_machine import StateMachine
from app.core.summary_service import get_summary_service
from app.core.transcript_poller import get_transcript_poller
from app.models.agents import Agent, AgentState, BossState
from app.models.common import BubbleContent, BubbleType
from app.models.events import Event, EventData, EventType

__all__ = [
    "handle_subagent_start",
    "handle_subagent_info",
    "handle_subagent_stop",
    "handle_agent_update",
    "enrich_agent_with_summaries",
    "enrich_agent_from_transcript",
    "extract_and_set_agent_speech",
]

logger = logging.getLogger(__name__)

# Callback type aliases used for the poller initialisation and state-update hooks.
EnsureTranscriptPollFn = Callable[[], None]
UpdateAgentStateFn = Callable[[str, str, AgentState], Awaitable[None]]
PersistSyntheticEventFn = Callable[
    [str, EventType, "EventData | dict[str, Any] | None"], Awaitable[None]
]


async def handle_subagent_start(
    sm: StateMachine,
    event: Event,
    ensure_transcript_poller_fn: EnsureTranscriptPollFn,
    update_agent_state_fn: UpdateAgentStateFn,
) -> None:
    """Handle a SUBAGENT_START event.

    Enriches the new agent's name/task via AI summaries, starts transcript
    polling, and transitions the agent into WALKING_TO_DESK.

    Args:
        sm: The StateMachine for this session.
        event: The SUBAGENT_START event.
        ensure_transcript_poller_fn: Callable that initialises the poller.
        update_agent_state_fn: Async callable that sets agent state and
            broadcasts.
    """
    if not (event.data and event.data.agent_id):
        return

    agent_id = event.data.agent_id
    logger.info(
        f"SUBAGENT_START: agent_id={agent_id} "
        f"agent_name={event.data.agent_name!r} "
        f"task_description={str(event.data.task_description or '')[:60]!r} "
        f"agent_type={event.data.agent_type!r}"
    )

    if agent_id in sm.agents:
        await enrich_agent_with_summaries(sm.agents[agent_id], event.data)
        # Propagate enriched short name to the lifespan record.
        enriched_name = sm.agents[agent_id].name
        if enriched_name:
            for lifespan in sm.agent_lifespans:
                if lifespan.agent_id == agent_id:
                    lifespan.agent_name = enriched_name
                    break

    await broadcast_state(event.session_id, sm)

    sm.boss_state = BossState.DELEGATING

    transcript_path = event.data.agent_transcript_path
    if transcript_path:
        ensure_transcript_poller_fn()
        poller = get_transcript_poller()
        if poller:
            await poller.start_polling(agent_id, event.session_id, transcript_path)

    await update_agent_state_fn(event.session_id, agent_id, AgentState.WALKING_TO_DESK)
    sm.boss_state = BossState.IDLE
    await broadcast_state(event.session_id, sm)


async def handle_subagent_info(
    sm: StateMachine,
    event: Event,
    ensure_transcript_poller_fn: EnsureTranscriptPollFn,
) -> None:
    """Handle a SUBAGENT_INFO event.

    Synthesises a SUBAGENT_START for agents whose start was missed (e.g. after
    a backend restart), links native IDs, and starts transcript polling.

    Args:
        sm: The StateMachine for this session.
        event: The SUBAGENT_INFO event.
        ensure_transcript_poller_fn: Callable that initialises the poller.
    """
    if not event.data:
        return

    transcript_path = event.data.agent_transcript_path
    native_agent_id = event.data.native_agent_id

    if not (transcript_path and native_agent_id):
        return

    # Synthesise a SUBAGENT_START if we have no agent tracking this native ID
    # and there are no unlinked (native_id=None) agents already present.
    already_tracked = any(a.native_id == native_agent_id for a in sm.agents.values())
    if not already_tracked and not any(a.native_id is None for a in sm.agents.values()):
        synthetic_data = EventData(
            agent_id=f"subagent_{native_agent_id}",
            native_agent_id=native_agent_id,
            agent_transcript_path=transcript_path,
            agent_type=event.data.agent_type,
            agent_name=event.data.agent_type,
        )
        synthetic_start = Event(
            event_type=EventType.SUBAGENT_START,
            session_id=event.session_id,
            timestamp=event.timestamp,
            data=synthetic_data,
        )
        sm.transition(synthetic_start)
        logger.info(
            f"Synthesized SUBAGENT_START for native agent {native_agent_id} "
            f"(missed due to backend restart)"
        )

    ensure_transcript_poller_fn()
    poller = get_transcript_poller()
    if poller:
        for agent_id, agent in sm.agents.items():
            # Link and enrich agents that have not yet been assigned a native_id.
            if agent.native_id is None:
                agent.native_id = native_agent_id
                logger.info(f"Linked agent {agent_id} to native ID {native_agent_id}")
                await enrich_agent_from_transcript(agent, transcript_path, event.data.agent_type)
            if not await poller.is_polling(agent_id):
                logger.info(
                    f"Starting transcript polling for {agent_id} "
                    f"(native: {native_agent_id}) at {transcript_path}"
                )
                await poller.start_polling(agent_id, event.session_id, transcript_path)
                break

    # Also enrich the freshly synthesised agent (its native_id was already set
    # by sm.transition above, so the loop above skips it via the None guard).
    synth_id = f"subagent_{native_agent_id}"
    synth_agent = sm.agents.get(synth_id)
    if synth_agent and not synth_agent.current_task:
        await enrich_agent_from_transcript(synth_agent, transcript_path, event.data.agent_type)


async def handle_subagent_stop(
    sm: StateMachine,
    event: Event,
    persist_synthetic_event_fn: PersistSyntheticEventFn,
) -> None:
    """Handle a SUBAGENT_STOP event.

    Resolves the agent by ID or native ID, extracts a completion speech bubble,
    removes the agent from the StateMachine, and persists a CLEANUP synthetic
    event.

    Args:
        sm: The StateMachine for this session.
        event: The SUBAGENT_STOP event.
        persist_synthetic_event_fn: Async callable to persist a synthetic event.
    """
    if not event.data:
        return

    agent_id = event.data.agent_id
    native_agent_id = event.data.native_agent_id

    # Resolve agent: try by agent_id first, then fall back to native_id lookup.
    if agent_id and agent_id in sm.agents:
        resolved_agent_id = agent_id
    elif native_agent_id:
        resolved_agent_id = None
        for aid, agent in sm.agents.items():
            if agent.native_id == native_agent_id:
                resolved_agent_id = aid
                logger.info(f"Resolved native agent {native_agent_id} to {aid}")
                break
        if not resolved_agent_id:
            logger.warning(f"SUBAGENT_STOP for unknown native agent {native_agent_id}, skipping")
            return
    else:
        logger.warning("SUBAGENT_STOP with no agent_id or native_agent_id, skipping")
        return

    poller = get_transcript_poller()
    if poller:
        await poller.stop_polling(resolved_agent_id)

    await extract_and_set_agent_speech(sm, resolved_agent_id, event.data.agent_transcript_path)

    await broadcast_state(event.session_id, sm)

    sm.remove_agent(resolved_agent_id)
    await persist_synthetic_event_fn(event.session_id, EventType.CLEANUP, event.data)
    await broadcast_state(event.session_id, sm)


async def handle_agent_update(
    sm: StateMachine,
    event: Event,
) -> None:
    """Handle an AGENT_UPDATE event.

    Updates the bubble content for a specific agent.

    Args:
        sm: The StateMachine for this session.
        event: The AGENT_UPDATE event.
    """
    if not (event.data and event.data.agent_id):
        return

    agent_id = event.data.agent_id
    if agent_id in sm.agents and event.data.bubble_content:
        sm.agents[agent_id].bubble = event.data.bubble_content
        logger.debug(f"Updated agent {agent_id} bubble: {event.data.bubble_content.text[:50]}...")
        await broadcast_state(event.session_id, sm)


async def enrich_agent_with_summaries(agent: Agent, event_data: EventData) -> None:
    """Generate a short agent name and task summary using the AI summary service.

    Args:
        agent: The agent to enrich in-place.
        event_data: Event payload containing name/task hints.
    """
    summary_service = get_summary_service()

    name_source = (
        event_data.agent_name or event_data.task_description or event_data.agent_type or ""
    )
    task_source = event_data.task_description or event_data.agent_name or ""

    if name_source:
        agent.name = await summary_service.generate_agent_name(name_source)

    if task_source:
        agent.current_task = await summary_service.summarize_agent_task(task_source)

    logger.debug(f"Enriched agent {agent.id}: name='{agent.name}', task='{agent.current_task}'")


async def enrich_agent_from_transcript(
    agent: Agent,
    transcript_path: str,
    agent_type: str | None = None,
) -> None:
    """Read the first user prompt from a transcript and enrich the agent's task/name.

    Used for agents created without task details (ghost/synthetic agents spawned
    after a backend restart or missed SUBAGENT_START).

    Args:
        agent: The agent to enrich in-place.
        transcript_path: Path to the agent's JSONL transcript file.
        agent_type: Optional agent type used as a name fallback.
    """
    from app.config import get_settings  # local import to avoid cycles

    settings = get_settings()
    translated_path = settings.translate_path(transcript_path)
    task_text = get_first_user_prompt(translated_path)
    if not task_text:
        logger.debug(f"No user prompt found in transcript for agent {agent.id}")
        return

    synthetic_data = EventData(
        agent_id=agent.id,
        agent_type=agent_type,
        agent_name=agent_type,
        task_description=task_text,
    )
    await enrich_agent_with_summaries(agent, synthetic_data)
    logger.info(
        f"Enriched agent {agent.id} from transcript: "
        f"name='{agent.name}', task='{agent.current_task}'"
    )


async def extract_and_set_agent_speech(
    sm: StateMachine,
    agent_id: str,
    transcript_path: str | None,
) -> None:
    """Extract an agent's last response from transcript and set its speech bubble.

    Args:
        sm: The StateMachine for this session.
        agent_id: The agent whose bubble should be updated.
        transcript_path: Path to the JSONL transcript, or None.
    """
    if not transcript_path or agent_id not in sm.agents:
        return

    from app.config import get_settings  # local import to avoid cycles

    settings = get_settings()
    translated_path = settings.translate_path(transcript_path)

    response = get_last_assistant_response(translated_path)
    if not response:
        return

    summary_service = get_summary_service()
    summary = await summary_service.summarize_response(response)

    if summary:
        sm.agents[agent_id].bubble = BubbleContent(
            type=BubbleType.SPEECH,
            text=summary,
            icon="✅",
        )
        logger.debug(f"Set agent {agent_id} completion summary: {summary[:50]}...")
