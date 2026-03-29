# Panoptica Phase 4: Agent Teams Support — Design Spec

**Goal:** Render Claude Code Agent Teams sessions with full lead/teammate/subagent visual fidelity, a kanban task board populated from real hook events, and multi-session room composition via a RoomOrchestrator layer.

**Scope:** Agent Teams rendering within the existing room structure. The floor-as-workspace redesign (collapsing rooms into floors) is deferred to Phase 5.

---

## 1. Hook Pipeline & Event Model

### New Hook Registrations

Three new hook events added to `~/.claude/settings.json` via `hooks/manage_hooks.py`:

| Hook Event | When It Fires |
|-----------|--------------|
| `TaskCreated` | When `TaskCreate` tool is used (any session, not just teams) |
| `TaskCompleted` | When `TaskUpdate` marks a task completed (any session) |
| `TeammateIdle` | When an Agent Teams teammate finishes its turn |

### New EventType Values

```python
TASK_CREATED = "task_created"
TASK_COMPLETED = "task_completed"
TEAMMATE_IDLE = "teammate_idle"
```

### New EventData Fields

```python
team_name: str | None = None       # Present on ALL events from team sessions
teammate_name: str | None = None   # Identifies which teammate fired the event
task_subject: str | None = None    # From TaskCreated/TaskCompleted payloads
```

The existing `task_id` and `task_description` fields on EventData are reused for team task payloads.

### Event Mapper

The hooks CLI event mapper (`hooks/src/claude_office_hooks/event_mapper.py`) maps `TaskCreated`, `TaskCompleted`, and `TeammateIdle` 1:1 — no transformation needed, they arrive as-is from Claude Code. The `team_name`, `teammate_name`, `task_id`, `task_subject`, and `task_description` fields are extracted from the hook payload and placed on EventData.

---

## 2. Team Detection & Session Grouping

### Detection Logic

When an event arrives with `team_name` set, Panoptica marks that session as a team session:

1. **First event with `team_name`** from a session stores `team_name` and `teammate_name` on `SessionRecord`.
2. **Role detection**: A session is the lead if its `teammate_name` is absent or null in the hook payload. Claude Code only sets `teammate_name` on teammate sessions — the lead session's events have `team_name` but no `teammate_name`. If `teammate_name` is present, it's a teammate session.
3. **Room grouping**: All sessions with the same `team_name` get routed to the same room. The lead session's `ProductMapper` result determines the room. Teammate sessions inherit the lead's `floor_id`/`room_id` even if their own `cwd` differs (e.g., git worktrees).

### New Fields on SessionRecord

```python
team_name: Mapped[str | None] = mapped_column(String, nullable=True)
teammate_name: Mapped[str | None] = mapped_column(String, nullable=True)
is_lead: Mapped[bool] = mapped_column(default=False)
```

### New Fields on StateMachine

```python
team_name: str | None = None
teammate_name: str | None = None
is_lead: bool = False
```

### EventProcessor Changes

When `EventProcessor` sees a `team_name` on an incoming event:

- Sets `team_name`/`teammate_name` on the `SessionRecord` and `StateMachine`.
- If `teammate_name` is absent/null, marks the session as `is_lead = True`.
- If `teammate_name` is present, marks as `is_lead = False` and looks up the lead session (the session with the same `team_name` and `is_lead = True`) to copy `floor_id`/`room_id` to the teammate's `SessionRecord`. If the lead hasn't arrived yet, room assignment is deferred until the lead's first event.

---

## 3. RoomOrchestrator

New layer between StateMachines and WebSocket broadcast. Composes multiple sessions into a single room view.

### Architecture

```
EventProcessor -> StateMachine (per session, unchanged)
                      |
               RoomOrchestrator (per room)
                      |
               Merged RoomGameState -> WebSocket broadcast
```

### Responsibilities

- Owns the set of session IDs for its room.
- On any session update, pulls each session's `StateMachine.to_game_state()` and merges into a single `RoomGameState`.
- Assigns character types and desk positions based on the visual hierarchy.
- Maintains room-level state: the kanban task board.

### Merging Logic

| Source | Character Type | Desk Position |
|--------|---------------|--------------|
| Lead session's boss | `"lead"` | Corner desk |
| Teammate session's boss | `"teammate"` | Grid desks, unique color |
| Lead's subagents | `"subagent"` | Clustered near lead, lead's color tint |
| Teammate's subagents | `"subagent"` | Clustered near parent teammate, parent's color tint |

### Character Allocation

Each character in the merged state gets:
- `character_type`: `"lead"` | `"teammate"` | `"subagent"`
- `parent_session_id`: which session owns this character
- `parent_id`: for subagents, the ID of their parent lead/teammate character
- `color`: inherited from parent for subagents, unique per teammate

### Lifecycle

- Created lazily when the first session arrives for a room.
- Destroyed when all sessions in the room end or are removed.
- Solo sessions (no `team_name`) get a trivial pass-through orchestrator — one session, no merging, existing behavior unchanged.

### Kanban Board

The orchestrator maintains a `KanbanBoard` dataclass:

```python
@dataclass
class KanbanTask:
    task_id: str
    subject: str
    status: str  # "pending" | "in_progress" | "completed"
    assignee: str | None  # teammate_name, if available
    linear_id: str | None  # parsed from subject, e.g. "[REC-123]"

@dataclass
class KanbanBoard:
    tasks: dict[str, KanbanTask]  # keyed by task_id
```

Updated on `TaskCreated` (adds task) and `TaskCompleted` (moves to done). Task status transitions to `in_progress` are detected from `TaskUpdate` events or when a teammate starts working on a task.

Linear issue IDs are parsed from task subjects via regex: `\[([A-Z]+-\d+)\]`.

---

## 4. Visual Hierarchy & Character Design

### Three Character Types

**Lead (Boss)**
- Gold/amber color scheme
- Crown sprite overlay
- Corner desk with star nameplate
- In team sessions: shows "coordinating" state, delegates work
- In solo sessions: unchanged behavior (works directly)

**Teammate**
- Unique color per teammate (from existing color palette)
- Badge icon overlay
- Full desk with `teammate_name` nameplate
- Works independently: reads, writes, runs tests
- Has own thought/speech bubbles
- Source: teammate session's boss character, promoted to teammate type

**Subagent**
- Smaller sprite scale
- Gray base color
- Simple station (smaller desk, no nameplate)
- Colored shoulder dot matching parent (gold = lead's, blue = implementer's, etc.)
- Clustered near parent's desk
- Source: any session's subagent

### Spatial Layout

- Lead always at corner desk (top-left area).
- Teammates fill grid desks in order of arrival.
- Subagents cluster near their parent character's desk.
- Meeting room activates only for subagent spawns (`SubagentStart`/`SubagentStop`), not for teammate arrivals. Teammates appear directly at their desks.

---

## 5. Kanban Whiteboard Mode

New whiteboard mode activated by pressing `K`.

### Display

Three-column layout: **Todo** | **In Progress** | **Done**

Each task is a sticky note showing:
- Task subject text
- Linear issue badge (e.g., `REC-123`) if detected in subject — rendered as a colored tag
- Assignee name (if `teammate_name` available) — small text below subject

### Data Source

Populated from `TaskCreated`/`TaskCompleted` events for ALL sessions (solo and team). In solo sessions, the kanban shows your own task progress. In team sessions, it shows the full team task board with teammate attribution.

### Broadcast

The merged `RoomGameState` includes a `kanban_tasks` list in `whiteboard_data`:

```python
kanban_tasks: list[KanbanTask]  # task_id, subject, status, assignee, linear_id
```

Frontend whiteboard component reads this when in kanban mode.

---

## 6. Event Processing Flow

```
Hook fires (Claude Code)
  -> event_mapper.py (hooks CLI)
  -> POST /api/v1/events (backend)
  -> EventProcessor._persist_event()
      - Stores team_name/teammate_name on SessionRecord
      - Detects lead vs teammate (is_lead)
      - Teammate inherits lead's room assignment
  -> EventProcessor._process_event_internal()
      - Routes to existing StateMachine (per session, unchanged)
      - Also routes to RoomOrchestrator for the session's room
  -> RoomOrchestrator.on_session_updated(session_id)
      - Merges all session StateMachines into RoomGameState
      - Updates kanban from TaskCreated/TaskCompleted events
      - Assigns character types (lead/teammate/subagent)
      - Allocates desk positions
  -> broadcast_state() sends merged RoomGameState via WebSocket
```

### TeammateIdle Handling

`TeammateIdle` events update the teammate session's StateMachine: the boss character transitions to idle state. The RoomOrchestrator picks this up on merge and the teammate character goes idle at their desk.

---

## 7. WebSocket Protocol Changes

Currently each WebSocket connection subscribes to one session. With the orchestrator, the frontend can subscribe to a **room** instead.

### New Message Type

```json
{ "type": "subscribe_room", "room_id": "recepthor-api" }
```

The backend routes this to the RoomOrchestrator, which broadcasts merged state on any session change within the room.

### Backward Compatibility

The existing `subscribe` (session-level) message type continues to work for the mobile view and any direct session access. Room subscription is used by `RoomView` in desktop mode.

---

## 8. Frontend Changes

### WebSocket Hook

`useWebSocketEvents` gains a `roomId` option. When in room view, it sends `subscribe_room` instead of session-level `subscribe`. The `useRoomSessions` hook provides the `roomId`.

### Character Rendering (PixiJS)

The `Agent` model in `GameState` gains:
- `character_type: "lead" | "teammate" | "subagent"` — determines sprite selection
- `parent_id: str | None` — for subagents, links to parent character

Sprite rendering per type:
- **Lead**: existing boss sprite + crown overlay sprite
- **Teammate**: existing boss sprite + badge overlay + nameplate text
- **Subagent**: existing agent sprite at ~80% scale + colored dot sprite matching `parent_id`'s color

### Kanban Whiteboard Component

New React component following the existing whiteboard mode pattern. Renders three columns with sticky notes. Parses `[XXX-123]` regex from subjects for Linear badge rendering.

### GameStore

Minimal changes. The `agents` list now includes characters of all three types. The `boss` field still represents the lead. No structural change to the store — the server sends the right shape.

---

## 9. Summary of Changes

| Component | What Changes |
|-----------|-------------|
| Hooks CLI (`event_mapper.py`, `manage_hooks.py`) | Register 3 new events, extract team fields from payloads |
| `EventData` / `EventType` | 3 new event types, `team_name`/`teammate_name`/`task_subject` fields |
| `SessionRecord` | `team_name`, `teammate_name`, `is_lead` columns |
| `StateMachine` | `team_name`, `teammate_name`, `is_lead` fields (no logic changes) |
| `EventProcessor` | Team detection, teammate room inheritance, orchestrator routing |
| `RoomOrchestrator` (new) | Multi-session merging, character allocation, kanban board |
| WebSocket protocol | `subscribe_room` message type alongside existing `subscribe` |
| Frontend WebSocket hook | Room-level subscription option |
| Frontend PixiJS sprites | Lead crown, teammate badge+nameplate, subagent shoulder dot |
| Frontend whiteboard | New kanban mode (`K`) with sticky notes and Linear badges |

### Not In Scope (Phase 5+)

- Floor-as-workspace redesign (collapsing rooms into product-level floors)
- Haiku-powered creative names
- Sound effects
- Celebration animations
- City skyline day/night cycle
