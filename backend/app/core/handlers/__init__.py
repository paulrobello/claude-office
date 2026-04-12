"""Event handler modules for the EventProcessor router.

Each sub-module is responsible for a cohesive group of event types:

- ``session_handler``    -- SESSION_START, SESSION_END
- ``agent_handler``      -- SUBAGENT_START, SUBAGENT_INFO, SUBAGENT_STOP, AGENT_UPDATE
- ``tool_handler``       -- PRE_TOOL_USE, POST_TOOL_USE
- ``conversation_handler`` -- USER_PROMPT_SUBMIT, STOP
- ``team_handler``       -- TASK_CREATED, TASK_COMPLETED, TEAMMATE_IDLE
"""

from app.core.handlers.agent_handler import (
    enrich_agent_from_transcript,
    enrich_agent_with_summaries,
    extract_and_set_agent_speech,
    handle_agent_update,
    handle_subagent_info,
    handle_subagent_start,
    handle_subagent_stop,
)
from app.core.handlers.conversation_handler import (
    detect_and_set_print_report,
    extract_and_set_boss_speech,
    handle_stop,
    handle_user_prompt_submit,
)
from app.core.handlers.session_handler import (
    derive_task_list_id_from_root,
    ensure_task_poller_running,
    handle_session_end,
    handle_session_start,
)
from app.core.handlers.team_handler import (
    handle_task_completed,
    handle_task_created,
    handle_teammate_idle,
)
from app.core.handlers.tool_handler import handle_pre_tool_use

__all__ = [
    # session
    "handle_session_start",
    "handle_session_end",
    "ensure_task_poller_running",
    "derive_task_list_id_from_root",
    # agent
    "handle_subagent_start",
    "handle_subagent_info",
    "handle_subagent_stop",
    "handle_agent_update",
    "enrich_agent_with_summaries",
    "enrich_agent_from_transcript",
    "extract_and_set_agent_speech",
    # tool
    "handle_pre_tool_use",
    # conversation
    "handle_user_prompt_submit",
    "handle_stop",
    "extract_and_set_boss_speech",
    "detect_and_set_print_report",
    # team
    "handle_task_created",
    "handle_task_completed",
    "handle_teammate_idle",
]
