# Refactor Audit

## Executive Summary
- Total findings: 16 (high: 6, medium: 7, low: 3)
- Files exceeding 800 lines: 4
- Files in the 500-800 line warning zone: 10
- Estimated total effort: XL

## Findings (ranked by impact)

### [HIGH] R-01: Whiteboard Component Monolith — `frontend/src/components/game/Whiteboard.tsx` (1558 lines)
**Category**: God Object
**Effort**: L
**Recommendation**: Extract 11 display modes into separate components:
- `TodoListMode.tsx` (Mode 0)
- `RemoteWorkersMode.tsx` (Mode 1 - background tasks)
- `ToolPizzaMode.tsx` (Mode 2 - pie chart)
- `OrgChartMode.tsx` (Mode 3)
- `StonksMode.tsx` (Mode 4)
- `WeatherMode.tsx` (Mode 5)
- `SafetyBoardMode.tsx` (Mode 6)
- `TimelineMode.tsx` (Mode 7)
- `NewsTickerMode.tsx` (Mode 8)
- `CoffeeMode.tsx` (Mode 9)
- `HeatMapMode.tsx` (Mode 10)

Create a `WhiteboardModeRegistry.ts` for mode switching logic. Main `Whiteboard.tsx` should be ~200 lines.

---

### [HIGH] R-02: GameStore Responsibilities Overload — `frontend/src/stores/gameStore.ts` (1198 lines)
**Category**: God Object
**Effort**: L
**Recommendation**: Split into focused stores:
- `agentStore.ts` - Agent state, phases, positions, bubbles
- `bossStore.ts` - Boss state, position, bubble
- `queueStore.ts` - Arrival/departure queues
- `officeStore.ts` - Elevator, phone, context utilization, todos
- `uiStore.ts` - Debug mode, replay, connection status

Use Zustand's composition pattern with `combine` and middleware. This reduces each store to ~200-300 lines.

---

### [HIGH] R-03: Duplicated Bubble/Arm Drawing — `frontend/src/components/game/{BossSprite,AgentSprite}.tsx`
**Category**: DRY
**Effort**: M
**Recommendation**: Create shared drawing utilities:
- `frontend/src/components/game/shared/drawBubble.ts` - Common bubble drawing function
- `frontend/src/components/game/shared/drawArm.ts` - Parameterized arm drawing (left/right)
- `frontend/src/components/game/shared/iconMap.ts` - Single ICON_MAP constant

Both components import from shared modules. Reduces code by ~150 lines and ensures consistency.

---

### [HIGH] R-04: Event Processor God Class — `backend/app/core/event_processor.py` (911 lines)
**Category**: God Object
**Effort**: L
**Recommendation**: Split into focused handlers:
- `session_handler.py` - SESSION_START, SESSION_END events
- `agent_handler.py` - SUBAGENT_START, SUBAGENT_STOP, AGENT_UPDATE
- `tool_handler.py` - PRE_TOOL_USE, POST_TOOL_USE
- `conversation_handler.py` - USER_PROMPT_SUBMIT, STOP events
- `broadcast_service.py` - WebSocket broadcasting logic

Main `EventProcessor` becomes a router that delegates to handlers.

---

### [HIGH] R-05: Main Page Component Complexity — `frontend/src/app/page.tsx` (1045 lines)
**Category**: God Object
**Effort**: M
**Recommendation**: Extract components:
- `SessionSidebar.tsx` - Session list and selection (~150 lines)
- `MobileDrawer.tsx` - Mobile menu drawer (~150 lines)
- `HeaderControls.tsx` - Header buttons and status (~100 lines)
- `StatusToast.tsx` - Status message display (~50 lines)

Use custom hooks for logic:
- `useSessions.ts` - Session fetching and management
- `useSessionSwitch.ts` - Session switching logic

---

### [HIGH] R-06: Type Duplication Between Frontend/Backend
**Category**: Missing Abstraction
**Effort**: M
**Recommendation**: Generate TypeScript types from Python Pydantic models:
1. Add `pydantic-to-typescript` or similar tool
2. Generate `frontend/src/types/generated.ts` from `backend/app/models/`
3. Update frontend to import from generated types

This ensures type safety across the stack and eliminates drift.

---

### [MEDIUM] R-07: State Machine Complexity — `backend/app/core/state_machine.py` (775 lines)
**Category**: File Size
**Effort**: M
**Recommendation**: Extract whiteboard data tracking into separate class:
- `whiteboard_tracker.py` - Tool usage, news items, agent lifespans, heat map data

Move JSONL parsing methods to `jsonl_parser.py` (already exists). Keep state machine focused on state transitions only.

---

### [MEDIUM] R-08: XState Machine Definitions — `frontend/src/machines/agentMachine.ts` (751 lines)
**Category**: File Size
**Effort**: M
**Recommendation**: Split arrival and departure flows:
- `agentArrivalMachine.ts` - States from spawn to idle (~350 lines)
- `agentDepartureMachine.ts` - States from removal to elevator exit (~350 lines)
- `agentMachineCommon.ts` - Shared actions, guards, types

Use XState's `createMachine` composition to combine at runtime.

---

### [MEDIUM] R-09: Agent Machine Service — `frontend/src/machines/agentMachineService.ts` (714 lines)
**Category**: File Size
**Effort**: M
**Recommendation**: Extract queue management logic:
- `queueManager.ts` - Queue reservations, position updates, ready position tracking

Extract position utilities:
- `positionHelpers.ts` - `getDeskPosition`, elevator position helpers

Service becomes a thin coordinator between state machines and helpers.

---

### [MEDIUM] R-10: CityWindow Animation Complexity — `frontend/src/components/game/CityWindow.tsx` (703 lines)
**Category**: File Size
**Effort**: S
**Recommendation**: Extract rendering functions:
- `skyRenderer.ts` - Sky gradient, sun, moon, stars, clouds
- `buildingRenderer.ts` - Building silhouettes and windows
- `timeUtils.ts` - Seasonal times, phase calculations

Component focuses on orchestration and state management.

---

### [MEDIUM] R-11: Hooks Script Complexity — `hooks/src/claude_office_hooks/main.py` (523 lines)
**Category**: File Size
**Effort**: S
**Recommendation**: Split into modules:
- `event_mapper.py` - `map_event()` function and event-specific handlers
- `config.py` - Configuration loading, constants
- `debug_logger.py` - Debug logging utilities

Main `main.py` becomes thin entry point (~100 lines).

---

### [MEDIUM] R-12: Frontend Types File — `frontend/src/types/index.ts` (245 lines)
**Category**: Missing Abstraction
**Effort**: S
**Recommendation**: Organize types into domain files:
- `types/events.ts` - EventType, WebSocketMessage, EventDetail
- `types/agents.ts` - Agent, Boss, AgentState, BossState
- `types/office.ts` - OfficeState, ElevatorState, PhoneState
- `types/whiteboard.ts` - WhiteboardData, AgentLifespan, NewsItem, etc.

`index.ts` re-exports all for backward compatibility.

---

### [MEDIUM] R-13: Backend Model Organization
**Category**: Module Boundary
**Effort**: S
**Recommendation**: Current `backend/app/models/` is well-organized. Minor improvement:
- Move `BubbleContent`, `TodoItem` from `common.py` to dedicated `ui.py` file
- Add `__all__` exports for cleaner imports

---

### [LOW] R-14: Sprite Debug Tools — `frontend/src/app/sprite-debug/` (multiple files, 568+ lines in imageProcessing.ts)
**Category**: Test Organization
**Effort**: S
**Recommendation**: Move entire `sprite-debug` directory to `frontend/src/components/debug/`. This is a development tool, not a user-facing page. Mark routes as development-only.

---

### [LOW] R-15: Simulation Script — `scripts/simulate_events.py` (694 lines)
**Category**: File Size
**Effort**: S
**Recommendation**: Extract simulation scenarios:
- `scenarios/basic.py` - Simple agent spawn/complete
- `scenarios/complex.py` - Multi-agent workflows
- `scenarios/edge_cases.py` - Error handling, permissions

Main script accepts scenario name as argument.

---

### [LOW] R-16: Inconsistent Logging Patterns
**Category**: Missing Abstraction
**Effort**: S
**Recommendation**: Create `backend/app/core/logging.py`:
- `get_logger(name)` - Returns configured logger
- `log_event(event_type, data)` - Structured event logging
- `log_error(error, context)` - Error logging with context

Standardizes logging format across all backend modules.

---

## Dependency Graph

**Wave 1** (no prerequisites - can be done in parallel):
- R-03: Duplicated Bubble/Arm Drawing (creates shared utilities)
- R-12: Frontend Types File Organization
- R-13: Backend Model Organization
- R-14: Sprite Debug Tools
- R-16: Logging Patterns

**Wave 2** (depends on Wave 1):
- R-06: Type Duplication (depends on R-12, R-13 for structure)
- R-07: State Machine Complexity (can use R-16 logging)
- R-08: XState Machine Definitions
- R-09: Agent Machine Service
- R-10: CityWindow Complexity
- R-11: Hooks Script Complexity
- R-15: Simulation Script

**Wave 3** (depends on Wave 2):
- R-02: GameStore Split (depends on R-08, R-09 for machine imports)
- R-04: Event Processor Split (depends on R-07 for handler extraction)
- R-05: Main Page Component (depends on R-02 for store usage)

**Wave 4** (depends on Wave 3):
- R-01: Whiteboard Component (can be done independently but benefits from R-02 store split)

## Appendix: Files by Line Count (descending)

| File | Lines | Status |
|------|-------|--------|
| frontend/src/components/game/Whiteboard.tsx | 1558 | CRITICAL |
| frontend/src/stores/gameStore.ts | 1198 | CRITICAL |
| frontend/src/app/page.tsx | 1045 | CRITICAL |
| backend/app/core/event_processor.py | 911 | CRITICAL |
| backend/app/core/state_machine.py | 775 | WARNING |
| frontend/src/machines/agentMachine.ts | 751 | WARNING |
| frontend/src/machines/agentMachineService.ts | 714 | WARNING |
| frontend/src/components/game/CityWindow.tsx | 703 | WARNING |
| scripts/simulate_events.py | 694 | WARNING |
| frontend/src/components/game/BossSprite.tsx | 599 | WARNING |
| frontend/src/components/game/OfficeGame.tsx | 590 | WARNING |
| frontend/src/app/sprite-debug/lib/imageProcessing.ts | 568 | WARNING |
| frontend/src/hooks/useWebSocketEvents.ts | 527 | WARNING |
| hooks/src/claude_office_hooks/main.py | 523 | WARNING |
| backend/app/core/summary_service.py | 492 | OK |
| frontend/src/components/game/AgentSprite.tsx | 490 | OK |
| frontend/src/systems/navigationGrid.ts | 451 | OK |
| frontend/src/app/sprite-debug/components/PreviewPanel.tsx | 447 | OK |
| frontend/src/systems/animationSystem.ts | 443 | OK |
| backend/tests/test_task_file_poller.py | 311 | OK |

## Recommended Execution Order

For maximum impact with minimal risk:

1. **Quick Wins (1-2 days)**: R-03, R-16 - Create shared utilities, improve logging
2. **Organization (2-3 days)**: R-12, R-13, R-14 - Clean up file organization
3. **Split Large Files (3-5 days)**: R-07, R-08, R-09, R-10, R-11 - Break up large files
4. **Major Refactors (1-2 weeks)**: R-01, R-02, R-04, R-05 - Split god objects
5. **Type Generation (2-3 days)**: R-06 - Single source of truth for types

Total estimated effort: 3-4 weeks for complete refactoring.
