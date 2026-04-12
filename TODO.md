# PR #20 Remaining Items

## To Do

- [ ] 1. **Attention/Command System** — Zustand attention store, Cmd+K command bar with fuzzy search, attention toasts with urgency scoring (3 new + 2 mod)
- [ ] 2. **Click-to-Focus** — Click character in canvas to open popup, send message to terminal, bring terminal to foreground via AppleScript (1 new + 3 mod)
- [x] 3. **Character Type Overlays** — Visual indicators: crown for leads, medal for teammates, colored dot for subagents (2 mod)
- [ ] 4. **Session Rename UI** — Double-click sidebar session name to inline-edit, calls `PATCH /sessions/{id}` (3 mod)
- [ ] 5. **AI Bubble Summarization** — Long bubble text (>60 chars) auto-summarized via AI; tool use events show tool emoji bubbles (3 mod)
- [ ] 6. **Display Name & Team Sync** — `_derive_display_name()` from working dir, teammate inherits lead's room, full team identity sync (1 mod)
- [ ] 7. **Hooks Team Events** — `TaskCreated`/`TaskCompleted`/`TeammateIdle` hook handlers, team field extraction from env vars (2 new + 2 mod)
- [ ] 8. **Simulation Scenarios** — `quick.py` fast scenario, `teams.py` multi-session team sim, enhanced `_base.py` (2 new + 3 mod)
- [ ] 9. **Floor/Room Session Hooks** — `useFloorSessions`, `useRoomSessions` hooks; room-level WebSocket in `useWebSocketEvents` (2 new + 1 mod)
- [x] 10. **Boss Lock Stuck Fix** — Auto-release boss `inUseBy` lock after 3s if no agent interacting (1 mod)
- [x] 11. **Canvas/Zoom Fixes** — Replace ResizeObserver (caused drift) with window resize listener, anchor canvas top-left (3 mod)
- [ ] ~~12. RoomView~~ — Dead code, superseded by FloorView — skip

## Done (previously ported)

- Room orchestrator, product mapper, floor config
- Kanban whiteboard mode
- 92 backend tests
- DB schema (6 new columns + SQLite migration)
- Room-level WebSocket connections
- broadcast_room_state
- New event types (TASK_CREATED, TASK_COMPLETED, TEAMMATE_IDLE)
- State machine team fields, agent character types
- building_config preserved on DB clear
- SQLite WAL mode fix
