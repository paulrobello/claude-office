"""Handler for USER_PROMPT_SUBMIT and STOP events.

Responsibilities:
- Summarising user prompts and storing them on the StateMachine.
- Capturing conversation history entries for user, assistant, and thinking roles.
- Extracting boss speech from transcripts on STOP.
- Detecting report requests on STOP.
"""

import logging

from app.core.broadcast_service import broadcast_state
from app.core.jsonl_parser import get_last_assistant_response
from app.core.state_machine import StateMachine
from app.core.summary_service import get_summary_service
from app.models.common import BubbleContent, BubbleType
from app.models.events import Event
from app.models.sessions import ConversationEntry

__all__ = [
    "handle_user_prompt_submit",
    "handle_stop",
    "extract_and_set_boss_speech",
    "detect_and_set_print_report",
]

logger = logging.getLogger(__name__)


async def handle_user_prompt_submit(
    sm: StateMachine,
    event: Event,
    agent_id: str,
) -> None:
    """Handle a USER_PROMPT_SUBMIT event.

    Summarises the user prompt, stores it as the boss's current task, and
    captures the prompt in the conversation history.

    Args:
        sm: The StateMachine for this session.
        event: The USER_PROMPT_SUBMIT event.
        agent_id: The resolved agent ID (``"main"`` for the boss).
    """
    if not (event.data and event.data.prompt):
        return

    summary_service = get_summary_service()
    sm.boss_current_task = await summary_service.summarize_user_prompt(event.data.prompt)
    logger.debug(f"Boss current task set to: {sm.boss_current_task}")

    # Skip task-notification messages from the conversation history.
    if "<task-notification>" not in event.data.prompt:
        conv_entry: ConversationEntry = {
            "id": str(event.timestamp.timestamp()),
            "role": "user",
            "agentId": agent_id or "main",
            "text": event.data.prompt,
            "timestamp": event.timestamp.isoformat(),
        }
        sm.conversation.append(conv_entry)

    await broadcast_state(event.session_id, sm)


async def handle_stop(
    sm: StateMachine,
    event: Event,
    agent_id: str,
) -> None:
    """Handle a STOP event.

    Extracts the assistant's last response from the transcript, sets the boss
    speech bubble, captures the response in conversation history, and checks
    whether the user prompt requested a report.

    Args:
        sm: The StateMachine for this session.
        event: The STOP event.
        agent_id: The resolved agent ID (``"main"`` for the boss).
    """
    if not event.data:
        return

    logger.info(
        f"STOP event: boss_bubble before extract = "
        f"{sm.boss_bubble.text[:50] if sm.boss_bubble else 'None'}..."
    )

    full_response = await extract_and_set_boss_speech(sm, event.data.transcript_path)

    logger.info(
        f"STOP event: boss_bubble after extract = "
        f"{sm.boss_bubble.text[:50] if sm.boss_bubble else 'None'}..."
    )

    if full_response:
        assistant_entry: ConversationEntry = {
            "id": str(event.timestamp.timestamp()),
            "role": "assistant",
            "agentId": agent_id or "main",
            "text": full_response,
            "timestamp": event.timestamp.isoformat(),
        }
        sm.conversation.append(assistant_entry)

    await detect_and_set_print_report(sm)
    logger.info(f"STOP event: print_report = {sm.print_report}")

    await broadcast_state(event.session_id, sm)


async def extract_and_set_boss_speech(
    sm: StateMachine,
    transcript_path: str | None,
) -> str | None:
    """Extract Claude's response from a transcript and set the boss speech bubble.

    Args:
        sm: The StateMachine whose boss_bubble should be updated.
        transcript_path: Path to the JSONL transcript file, or None.

    Returns:
        The full response text, or None if unavailable.
    """
    if not transcript_path:
        return None

    from app.config import get_settings  # local import to avoid cycles

    settings = get_settings()
    translated_path = settings.translate_path(transcript_path)

    response = get_last_assistant_response(translated_path)
    if not response:
        return None

    summary_service = get_summary_service()
    summary = await summary_service.summarize_response(response)

    if summary:
        sm.boss_bubble = BubbleContent(
            type=BubbleType.SPEECH,
            text=summary,
            icon="💬",
            persistent=True,
        )
        logger.debug(f"Set boss speech: {summary[:50]}...")

    return response


async def detect_and_set_print_report(sm: StateMachine) -> None:
    """Detect if the user's prompt requested a report and set the print_report flag.

    Args:
        sm: The StateMachine whose print_report flag should be updated.
    """
    if not sm.last_user_prompt:
        return

    summary_service = get_summary_service()
    sm.print_report = await summary_service.detect_report_request(sm.last_user_prompt)
    if sm.print_report:
        logger.debug(f"Report request detected in prompt: {sm.last_user_prompt[:50]}...")
