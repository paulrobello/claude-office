# Changelog

All notable changes to Claude Office Visualizer are documented here.

## [Unreleased] - Refactor

### Changed

- **Whiteboard split**: `Whiteboard.tsx` (1558 lines) extracted into 11 focused mode components (`TodoListMode`, `RemoteWorkersMode`, `ToolPizzaMode`, `OrgChartMode`, `StonksMode`, `WeatherMode`, `SafetyBoardMode`, `TimelineMode`, `NewsTickerMode`, `CoffeeMode`, `HeatMapMode`) under `components/game/whiteboard/` with a `WhiteboardModeRegistry` for mode switching. Main component reduced to 241 lines.
- **EventProcessor split**: `event_processor.py` (911 lines) extracted into `handlers/session_handler.py`, `handlers/agent_handler.py`, `handlers/tool_handler.py`, `handlers/conversation_handler.py`, and `broadcast_service.py`. Main class now a pure router (~390 lines).
- **page.tsx split**: `page.tsx` (1045 lines) extracted into layout components (`SessionSidebar`, `MobileDrawer`, `HeaderControls`, `StatusToast`, `MobileAgentActivity`, `RightSidebar`) and custom hooks (`useSessions`, `useSessionSwitch`). Main page reduced to 382 lines.
- **WhiteboardTracker extracted**: Whiteboard data tracking logic split out of `state_machine.py` into `backend/app/core/whiteboard_tracker.py`.
- **agentMachine split**: `agentMachine.ts` (751 lines) split into `agentMachineCommon.ts` (shared types/guards/actions), `agentArrivalMachine.ts`, and `agentDepartureMachine.ts`.
- **agentMachineService split**: `agentMachineService.ts` (714 lines) split into `queueManager.ts` (queue reservations) and `positionHelpers.ts` (desk/elevator position helpers).
- **CityWindow split**: `CityWindow.tsx` (703 lines) split into `city/skyRenderer.ts`, `city/buildingRenderer.ts`, and `city/timeUtils.ts`. Component reduced to 298 lines.
- **Hooks split**: `hooks/main.py` (523 lines) split into `config.py`, `debug_logger.py`, and `event_mapper.py`. Main entry point reduced to 155 lines.
- **Simulation split**: `scripts/simulate_events.py` (694 lines) split into a `scripts/scenarios/` package with `basic.py`, `complex.py`, and `edge_cases.py` scenarios. Entry point accepts a scenario name argument.
- **Shared drawing utilities**: Duplicated bubble/arm drawing code extracted from `BossSprite.tsx` and `AgentSprite.tsx` into `components/game/shared/drawBubble.ts`, `drawArm.ts`, and `iconMap.ts`.
- **Frontend types generated**: Hand-written `types/agents.ts`, `events.ts`, `office.ts`, `whiteboard.ts` replaced by `types/generated.ts` auto-generated from Pydantic backend models via `scripts/gen_types.py` + `json-schema-to-typescript`. Run `make gen-types` to regenerate after model changes.
- **Backend model `__all__` exports**: All backend model files (`common.py`, `agents.py`, `events.py`, `sessions.py`, `git.py`) now declare `__all__` for cleaner imports. New `models/ui.py` re-exports UI-focused types.
- **Backend logging module**: Added `backend/app/core/logging.py` with `get_logger()`, `log_event()`, and `log_error()` helpers for consistent structured logging across backend modules.
- **Sprite debug tools**: `app/sprite-debug/` tooling copied to `components/debug/sprite-debug/` for better separation of dev tools from app routes.

### Added

- `make gen-types` target: regenerates `frontend/src/types/generated.ts` from Pydantic models.
- Pre-commit hook: automatically reruns `gen-types` when any file in `backend/app/models/` changes.
- `.github/workflows/type-drift.yml`: CI job that fails if `generated.ts` is out of sync with the Pydantic models.

### Fixed

- `TodoListMode.tsx` used `todo.activeForm` (camelCase) but `TodoItem` has no `alias_generator`, so the backend sends `active_form`. Fixed to match actual wire format.

---

## [0.9.0] - 2026-03-01

### Added
- **Conversation History Tab**: New chat-style panel showing the full exchange — user prompts, Claude responses (with markdown rendering), thinking blocks, and tool calls. Toggle tool calls on/off with the wrench button; message count shown in the header.
- **Expand Conversation Modal**: Maximize button opens the conversation in a large overlay (900px wide, 85vh) for comfortable reading. Closes on Escape, outside click, or the X button.
- **Event Detail Modal**: Click any event in the event log to inspect its full detail payload.
- **Markdown Rendering**: Assistant responses in the conversation tab render full GitHub-flavoured markdown — headings, bold, italic, inline/block code, lists, blockquotes, links, and horizontal rules.

### Fixed
- **Conversation restore on reconnect**: Connecting to an already in-progress session now rebuilds the full conversation history (user prompts, tool calls, thinking blocks, and assistant responses) from stored events rather than showing an empty tab.
- **Agent desk marquee missing**: Subagent desk signs now always display when the agent is at their desk; falls back to agent name when the task summary is not yet available.
- **"Resumed mid-session" task**: During session restore the backend now reads each subagent's JSONL transcript to extract the actual first user prompt, then uses the AI summary service to generate a proper task description and agent name — replacing the generic placeholder.
- **Arrival queue status stuck**: `AgentStatus` panel no longer shows "In arrival queue" for agents that have already reached their desk; queue metadata is cleared as soon as the agent leaves the queue.
- **Office scene cropping on sidebar toggle**: Closing the left sidebar no longer crops the office canvas; a `ResizeObserver` resets the zoom/pan transform when the container changes size.
- **`<task-notification>` messages hidden**: Internal task-notification payloads no longer appear as conversation entries.

### Changed
- Added `frontend-build-static` as a root-level Makefile alias for the existing `build-static` target.

## [0.8.0] - 2026-02-28

### Fixed
- **Task List Discovery**: Tasks from projects using `CLAUDE_CODE_TASK_LIST_ID` are now correctly tracked. The task file poller now respects this env var and reads from `~/.claude/tasks/{task_list_id}/` instead of always falling back to the session ID directory.

### Changed
- Hook passes `CLAUDE_CODE_TASK_LIST_ID` to the backend in every event payload
- `EventData` model gains a `task_list_id` field
- `TaskFilePoller.start_polling()` accepts an optional `task_list_id` parameter
- Backend logs include the effective task list ID when it differs from the session ID

## [0.7.0] - 2026-02-01

### Added
- **Auto-Follow New Sessions**: Automatically detects and switches to new Claude Code sessions in the current project (enabled by default, configurable in Settings)

## [0.6.0] - 2026-01-01

### Added
- **User Preferences**: Persistent settings stored in backend database, survives browser refresh
- **Clock Display Options**: Click the wall clock to cycle between analog, digital 12h, and digital 24h formats
- **Settings Modal**: New settings button in header to configure preferences
- **Animated Clouds**: Clouds now drift slowly across the city window sky
- **Background Task Notifications**: Remote Workers whiteboard mode displays background task status in video-call-style tiles
- **Keyboard Shortcuts**: Press `0-9` to jump directly to whiteboard modes, `T` for Todo list, `B` for Background tasks
- **11 Whiteboard Modes**: Added Remote Workers mode

## [0.5.0] - 2026-01-01

### Added
- **City Skyline Window**: Real-time day/night cycle with seasonal sunrise/sunset times
- **AI-Powered Summaries**: Agent names and task descriptions generated by Claude Haiku
- **Context Compaction Animation**: Boss walks to trashcan and stomps it empty
- **Printer Station**: Animates when Claude produces reports or documentation
