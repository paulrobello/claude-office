# Changelog

All notable changes to Claude Office Visualizer are documented here.

## [Unreleased]

### Security

- **Localhost-only middleware**: All API endpoints now reject non-loopback connections (SEC-001)
- **CORS origins**: Replaced wildcard `["*"]` with configured localhost origins list (SEC-002)
- **WebSocket validation**: Added Origin header validation and session ID regex check on all WebSocket endpoints (SEC-003, SEC-009)
- **Clipboard write limits**: Added 10MB hard limit and 1MB soft limit on clipboard content (SEC-004)
- **Error message sanitization**: API routes no longer leak internal exception details to clients (SEC-005)
- **XXE protection**: Replaced `xml.etree.ElementTree` with `defusedxml` in hooks event parsing (SEC-006)
- **Configurable paths**: Removed hardcoded user-specific paths from hooks config (SEC-007)
- **Rate limiting**: Added sliding-window rate limiter on event ingestion (300 req/60s, configurable) (SEC-008)
- **Token redaction**: Debug logger now redacts OAuth tokens, API keys, and secrets (SEC-010)
- **Path traversal protection**: Static file serving validates requested paths stay within STATIC_DIR (SEC-011)
- **Static serving gate**: Static file serving now requires `SERVE_STATIC=1` env var (SEC-012)

### Changed

- **StateMachine refactor**: Replaced 230-line if/elif chain with dispatch table, extracted `TokenTracker` module (ARC-001)
- **Single state mutation**: Centralized state mutations in `transition()` dispatch table, removed redundant handler mutations (ARC-002)
- **Dependency injection**: Added `get_*()`/`override_*()` DI providers for event processor and WebSocket manager (ARC-003)
- **Dependency consolidation**: Removed duplicate deps from root pyproject.toml (ARC-004)
- **Sprite-debug deduplication**: Deleted 12 duplicate files (~3000 lines) from `app/sprite-debug/` (ARC-005)
- **Migration cleanup**: Removed unused `alembic` and `asyncpg` deps, documented intentional SQLite approach (ARC-006)
- **WebSocket URL**: Made configurable via `NEXT_PUBLIC_WS_URL` env var (ARC-009)
- **Platform abstraction**: Clipboard and terminal commands now platform-aware (macOS/Linux/Windows) (ARC-010)

### Fixed

- **N+1 query**: Session listing now uses single GROUP BY query instead of per-session COUNT (QA-002)
- **Silent exceptions**: Added logging to all catch blocks in TokenTracker (QA-005)
- **Console.log cleanup**: Removed 12 debug console.log statements from production frontend code (QA-003)
- **Broadcast duplication**: Extracted generic `_broadcast_to_connections()` helper in WebSocket manager (QA-007)
- **Async subprocess**: Converted `subprocess.run()` to `asyncio.create_subprocess_exec()` in focus endpoint (QA-011)
- **Transition atomicity**: Added try/except with logging in dispatch table invocation (QA-013)
- **Broadcast debounce**: Skip WebSocket broadcast when todos haven't changed (QA-015)
- **Magic numbers**: JSONL read sizes are now named constants in TokenTracker (QA-012)
- **Cyclomatic complexity**: transition() method reduced from 230 lines to 15 lines via dispatch table (QA-006)

### Added

- **CONTRIBUTING.md**: Development setup, code style, PR process, and code of conduct (DOC-003)
- **OpenCode plugin README**: Installation, configuration, event mapping, and development docs (DOC-004)
- **GitHub templates**: Bug report, feature request issue templates, and PR template (DOC-012)
- **Docstrings**: 26 Google-style docstrings added to public backend methods (DOC-005)

### Documentation

- **Multi-floor/Agent Teams**: Added comprehensive section to ARCHITECTURE.md (DOC-001)
- **API endpoint docs**: Added all missing endpoints to backend README (DOC-002)
- **Configuration reference**: Added env var table to ARCHITECTURE.md (DOC-006)
- **Frontend README**: Added missing stores, machines, hooks, and i18n documentation (DOC-011)
- **Version sync**: Updated stale VERSION field in config.py to 0.14.0 (DOC-007)
- **README cleanup**: Trimmed What's New section to reference CHANGELOG (DOC-010)
- **Emoji removal**: Cleaned emoji violations from QUICKSTART.md and frontend README (DOC-009)

## [0.14.0] - 2026-04-11

### Added

- **Pluralization Support (i18n)**: Translation system now supports singular/plural forms via `_one`/`_other` key suffixes. When `t()` is called with a `count` parameter, the correct plural form is automatically selected.
- **Star History Chart**: README now includes a Star History chart showing repository growth over time.

### Changed

- **Consolidated event-type-styles**: Replaced two separate 11-case switch statements with a single `EVENT_TYPE_STYLES` map. Adding new event types now requires only one entry instead of updating two switches.
- **Frontend**: Upgrade Next.js 16.2.1 → 16.2.3
- **Frontend**: Upgrade React / React DOM 19.2.4 → 19.2.5
- **Frontend**: Upgrade react-zoom-pan-pinch 3.7.0 → 4.0.3
- **Frontend**: Upgrade TypeScript 5.9.3 → 6.0.2
- **Frontend**: Upgrade lucide-react 1.7.0 → 1.8.0
- **Frontend**: Upgrade @types/node 25.5.0 → 25.6.0
- **Frontend**: Upgrade vitest 4.1.2 → 4.1.4
- **Frontend**: Upgrade prettier 3.8.1 → 3.8.2
- **Frontend**: Upgrade bun-types 1.3.11 → 1.3.12
- **Frontend**: Pin ESLint to ^9 (v10 incompatible with eslint-plugin-react)
- **Backend**: Upgrade anthropic 0.87.0 → 0.94.0
- **Backend**: Upgrade fastapi 0.135.2 → 0.135.3
- **Backend**: Upgrade uvicorn 0.42.0 → 0.44.0
- **Backend**: Upgrade SQLAlchemy 2.0.48 → 2.0.49
- **Backend**: Upgrade ruff 0.15.8 → 0.15.10
- **Backend**: Upgrade pytest 9.0.2 → 9.0.3
- **Backend**: Upgrade rich 14.3.3 → 14.3.4
- **Backend**: Upgrade click 8.3.1 → 8.3.2
- **Backend**: Upgrade greenlet 3.3.2 → 3.4.0
- **Backend**: Upgrade jiter 0.13.0 → 0.14.0
- **Backend**: Upgrade python-multipart 0.0.22 → 0.0.26

### Fixed

- **Grammar in count displays**: "1 events" now correctly shows as "1 event" across all locales (en, pt-BR, es).

## [0.13.0] - 2026-04-02

### Added

- **Internationalization (i18n)**: Full multi-language support with English, Portuguese (BR), and Spanish translations. Language selector in Settings modal with preference persisted across sessions.
- **`useTranslation` hook**: Centralized translation hook returning `t()`, `language`, and `dateFnsLocale` for locale-aware date formatting.
- **Event type translations**: Event type names in the event log and detail modal are now translatable across all locales.
- **i18n test suite**: Comprehensive unit tests covering key parity across locales, interpolation edge cases, prototype-pollution guards, and debug-mode warnings.
- **`NEXT_PUBLIC_I18N_DEBUG` env var**: Set to `true` in `.env.local` to log missing or duplicate translations to console during development.

### Changed

- **Deduplicated radiogroup handlers**: Extracted shared `handleRadioKeyDown<T>` utility in SettingsModal, replacing three identical inline handlers.
- **Centralized date-fns locale mapping**: `dateFnsLocale` now returned from `useTranslation` hook instead of duplicated ternaries in SessionSidebar and MobileDrawer.
- **Extracted `getEventTypeColor`**: Shared utility for event type badge and text colors, eliminating duplication between EventLog and EventDetailModal.

## [0.12.0] - 2026-03-31

### Added

- **OpenCode Plugin Integration**: New `opencode-plugin/` component sends OpenCode lifecycle events to the Claude Office backend, enabling the same pixel-art office visualization for OpenCode coding sessions
- **Session Labels**: Sessions can now be given custom labels via `PATCH /sessions/{id}/label`, displayed in the sidebar session list
- **Improved Session Selection**: Auto-selects the active session with the most events (better heuristic for distinguishing main vs child sessions)

### Changed

- **Dialect-agnostic session upsert**: Replaced SQLite-specific `INSERT OR IGNORE` with SQLAlchemy `session.merge()` for database portability
- **All dependencies updated** to latest versions: anthropic 0.87, eslint 9.39.4, pygments 2.20, starlette 1.0, @opencode-ai/plugin 1.3.12
- **CLAUDE.md** updated with OpenCode plugin in version management table and commands section

### Fixed

- **Git status panel messaging**: Three-state messaging (no session / no git repo / waiting) replaces binary check
- **Simulation sessions**: `sim_` sessions now correctly show git status in the panel

## [0.11.0] - 2026-03-28

### Added

- **Drag-to-resize sidebars**: Left and right sidebars now support drag-to-resize via edge handles for flexible workspace customization
- **Drag-to-resize panels**: Internal panels (Sessions/Git Status, Agent Status/Events) support vertical resizing via dividers
- **useDragResize hook**: Reusable custom hook for drag-to-resize functionality with viewport-relative constraints

### Changed

- **Python version requirement lowered to 3.13**: All components (root, backend, hooks) now require `>=3.13` instead of `>=3.14` for broader compatibility
- **Sidebar overflow on small screens**: Max heights now use viewport-relative values (70% of viewport) instead of hardcoded 800px
- **Unused import**: Removed unused `useRef` import from SessionSidebar

## [0.10.1] - 2026-03-18

### Added

- **Beads Integration**: Auto-detects `.beads/` directories in session project roots and polls `bd query --json` for open/in_progress/blocked issues, displaying them as todos in the visualizer's task list panel
- **Configurable beads polling**: `BEADS_POLL_INTERVAL` environment variable (default: 3.0 seconds)
- **Beads tests**: 37 comprehensive unit tests for beads_poller module

### Fixed

- **Subagent stuck in "arriving" state**: When native `SubagentStart` hooks don't produce `subagent_info` events, agents could get stuck forever. Added fallback linking in `SubagentStop` handler to match unlinked agents on-the-fly
- **Beads CLI error handling**: WARNING on first CLI failure, DEBUG for subsequent failures (avoids silent failures)

### Changed

- **Stable beads hashing**: Uses SHA-256 of id/title/status/owner fields for change detection instead of full JSON serialization
- **Updated ARCHITECTURE.md** with beads integration documentation

## [0.10.0] - 2026-03-01

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

### Documentation

- Synced all documentation with current implementation: architecture diagrams updated with event handlers and broadcast service, function locations fixed after event_processor refactor, project structure sections expanded with previously undocumented files.

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
