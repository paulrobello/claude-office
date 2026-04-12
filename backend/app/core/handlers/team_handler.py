"""Team event handlers for TASK_CREATED, TASK_COMPLETED, and TEAMMATE_IDLE.

These events are fired by Claude Code Agent Teams when
``CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`` is enabled.  The state machine
transitions (kanban updates, boss idle) are handled in ``state_machine.py``;
this module adds logging and room-level notifications.
"""

import logging

from app.core.state_machine import StateMachine
from app.models.events import Event

logger = logging.getLogger(__name__)


async def handle_task_created(sm: StateMachine, event: Event) -> None:
    """Handle a ``task_created`` team event.

    The state machine has already created a ``KanbanTask`` entry via
    ``StateMachine.transition()``.  This handler logs the creation and
    allows the room orchestrator broadcast (in ``EventProcessor``) to
    propagate the updated kanban board to teammates.

    Args:
        sm: The session's state machine (already transitioned).
        event: The task_created event.
    """
    task_id = event.data.task_id if event.data else None
    task_subject = event.data.task_subject if event.data else None
    logger.info(f"Task created: id={task_id} subject={task_subject} session={event.session_id}")


async def handle_task_completed(sm: StateMachine, event: Event) -> None:
    """Handle a ``task_completed`` team event.

    The state machine has already updated the kanban task status via
    ``StateMachine.transition()``.  This handler logs the completion.

    Args:
        sm: The session's state machine (already transitioned).
        event: The task_completed event.
    """
    task_id = event.data.task_id if event.data else None
    task_subject = event.data.task_subject if event.data else None
    logger.info(f"Task completed: id={task_id} subject={task_subject} session={event.session_id}")


async def handle_teammate_idle(sm: StateMachine, event: Event) -> None:
    """Handle a ``teammate_idle`` team event.

    The state machine has already set boss to IDLE and cleared the bubble
    via ``StateMachine.transition()``.  This handler logs the idle state
    so the room orchestrator broadcast propagates the teammate's status.

    Args:
        sm: The session's state machine (already transitioned).
        event: The teammate_idle event.
    """
    teammate_name = event.data.teammate_name if event.data else None
    logger.info(f"Teammate idle: name={teammate_name} session={event.session_id}")
