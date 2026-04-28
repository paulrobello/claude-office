# GEMINI_UPDATE.md — Gemini CLI Hooks Integration for Claude Office

> Research date: 2026-04-11
> Status: Research complete, pending implementation decision

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Gemini CLI Hooks Reference](#gemini-cli-hooks-reference)
3. [Event Mapping: Gemini CLI to Claude Office](#event-mapping-gemini-cli-to-claude-office)
4. [New Visual Opportunities](#new-visual-opportunities)
5. [Gaps and Limitations](#gaps-and-limitations)
6. [Architecture: Integration Design](#architecture-integration-design)
7. [Implementation Plan](#implementation-plan)
8. [Comparison: Codex CLI vs Gemini CLI vs Claude Code](#comparison-codex-cli-vs-gemini-cli-vs-claude-code)
9. [Sources](#sources)

---

## Executive Summary

Google Gemini CLI (v0.26.0+) has a mature hooks system with **11 lifecycle events** across 4 categories. It is significantly more capable than OpenAI Codex CLI (5 events, Bash-only interception) and maps to approximately **85% of Claude Office's event model**.

**Key finding:** Gemini CLI hooks are viable for Claude Office integration. The existing event-source abstraction (backend state machine + WebSocket broadcast + PixiJS renderer) requires zero changes — only a new event mapper adapter is needed.

**Unique opportunity:** Gemini CLI exposes `BeforeModel`/`AfterModel` and `BeforeToolSelection` hooks that Claude Code doesn't have, enabling new visualizations (LLM thinking animation, tool selection roulette, token streaming).

**Recommendation:** Proceed with integration in 3 phases, starting with the event mapper adapter.

---

## Gemini CLI Hooks Reference

### Event Categories and Lifecycle Points

#### Tool Events

| Event | When It Fires | Impact | Input Fields |
|:---|:---|:---|:---|
| `BeforeTool` | Before a tool is invoked | Block / Rewrite args | `tool_name`, `tool_input`, `mcp_context` |
| `AfterTool` | After a tool executes | Block Result / Chain | `tool_name`, `tool_input`, `tool_response`, `mcp_context` |

#### Agent Events

| Event | When It Fires | Impact | Input Fields |
|:---|:---|:---|:---|
| `BeforeAgent` | After user submits prompt, before planning | Block Turn / Inject context | `prompt` |
| `AfterAgent` | When agent loop ends (final response) | Retry / Halt | `prompt`, `prompt_response`, `stop_hook_active` |

#### Model Events (unique to Gemini CLI)

| Event | When It Fires | Impact | Input Fields |
|:---|:---|:---|:---|
| `BeforeModel` | Before sending request to LLM | Block / Mock response | `llm_request` (model, messages, config) |
| `BeforeToolSelection` | Before LLM selects tools | Filter available tools | `llm_request` |
| `AfterModel` | After receiving LLM response (every chunk) | Block / Redact | `llm_request`, `llm_response` |

#### Lifecycle / System Events

| Event | When It Fires | Impact | Input Fields |
|:---|:---|:---|:---|
| `SessionStart` | On startup, resume, or `/clear` | Advisory (inject context) | `source` (`startup`/`resume`/`clear`) |
| `SessionEnd` | On exit or clear | Advisory | `reason` (`exit`/`clear`/`logout`/`other`) |
| `PreCompress` | Before context compression | Advisory | `trigger` (`auto`/`manual`) |
| `Notification` | System alerts (tool permissions, etc.) | Advisory only | `notification_type`, `message`, `details` |

### Communication Contract

- **Transport:** JSON-over-stdin/stdout (identical pattern to Claude Code)
- **Exit codes:** 0 = success (stdout parsed as JSON), 2 = critical block, other = warning
- **Stdout:** Must contain only the final JSON object (no echo, no debug output)
- **Stderr:** For all logging/debugging (captured but not parsed)
- **Environment variables:** `GEMINI_PROJECT_DIR`, `GEMINI_SESSION_ID`, `GEMINI_CWD`, `CLAUDE_PROJECT_DIR` (compat alias)

### Configuration Format

Located at `.gemini/settings.json` (project) or `~/.gemini/settings.json` (user):

```json
{
  "hooks": {
    "BeforeTool": [
      {
        "matcher": "write_file|replace",
        "sequential": false,
        "hooks": [
          {
            "name": "office-hook",
            "type": "command",
            "command": "gemini-office-hook before_tool",
            "timeout": 2000,
            "description": "Claude Office tool event"
          }
        ]
      }
    ],
    "AfterTool": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "name": "office-hook",
            "type": "command",
            "command": "gemini-office-hook after_tool",
            "timeout": 2000
          }
        ]
      }
    ]
  }
}
```

### Built-in Tool Names (for matchers)

| Tool | Kind | Description |
|:---|:---|:---|
| `run_shell_command` | Execute | Arbitrary shell commands |
| `glob` | Search | File glob pattern matching |
| `grep_search` | Search | Regex search in file contents |
| `list_directory` | Read | List directory contents |
| `read_file` | Read | Read single file |
| `read_many_files` | Read | Read and concatenate multiple files |
| `replace` | Edit | Text replacement in file |
| `write_file` | Edit | Create or overwrite file |
| `ask_user` | Communicate | Interactive dialog |
| `write_todos` | Other | Internal task tracking |
| `activate_skill` | Other | Load specialized skill |
| `save_memory` | Think | Persist facts to GEMINI.md |
| `google_web_search` | Search | Google web search |
| `web_fetch` | Fetch | Retrieve URL content |
| `complete_task` | Other | Finalize subagent mission |
| `enter_plan_mode` | Plan | Switch to read-only plan mode |
| `exit_plan_mode` | Plan | Finalize plan and start implementation |

MCP tools follow naming pattern: `mcp_<server_name>_<tool_name>`

### Extension System

Gemini CLI has a full extension packaging format that can bundle hooks, MCP servers, custom commands, agent skills, sub-agents, policies, and themes.

```bash
# Extension installation
gemini extensions install https://github.com/user/claude-office-gemini
gemini extensions list
gemini extensions uninstall <name>
```

Extension manifest (`gemini-extension.json`):

```json
{
  "name": "claude-office-gemini",
  "version": "0.1.0",
  "description": "Claude Office visualizer for Gemini CLI",
  "hooks": "hooks/hooks.json",
  "mcpServers": { ... },
  "commands": [ ... ],
  "skills": [ ... ]
}
```

---

## Event Mapping: Gemini CLI to Claude Office

### Direct Mapping Table

Claude Office's `EventType` enum (`backend/app/models/events.py:16-38`) has 19 values. Here is how Gemini CLI's 11 events map to them:

| Claude Office `EventType` | Claude Code Source | Gemini CLI Equivalent | Mapping Quality |
|:---|:---|:---|:---|
| `session_start` | `SessionStart` | `SessionStart` | **Full** — identical semantics (startup/resume/clear) |
| `session_end` | `SessionEnd` | `SessionEnd` | **Full** — identical semantics |
| `pre_tool_use` | `PreToolUse` | `BeforeTool` | **Full** — `tool_name`, `tool_input`, `tool_use_id` available |
| `post_tool_use` | `PostToolUse` | `AfterTool` | **Full** — `tool_name`, `tool_response` available |
| `user_prompt_submit` | `UserPromptSubmit` | `BeforeAgent` | **Full** — `prompt` field carries user text |
| `subagent_start` | `SubagentStart` / `PreToolUse(Task)` | `BeforeTool(activate_skill)` | **Partial** — must infer from tool call, no native subagent lifecycle |
| `subagent_info` | `SubagentStart` | None (synthetic) | **Gap** — must be synthesized from `BeforeTool` metadata |
| `subagent_stop` | `SubagentStop` / `PostToolUse(Task)` | `AfterTool(complete_task)` | **Partial** — must infer, no `agent_id` |
| `agent_update` | Internal | `AfterTool(.*`)` | **Synthetic** — backend generates, not from hooks |
| `stop` | `Stop` | `AfterAgent` | **Full** — fires when agent loop ends |
| `context_compaction` | `PreCompact` | `PreCompress` | **Full** — `trigger` field (`auto`/`manual`) |
| `notification` | `Notification` | `Notification` | **Full** — `notification_type`, `message`, `details` |
| `permission_request` | `PermissionRequest` | `Notification(ToolPermission)` | **Partial** — advisory only, can't block |
| `cleanup` | Internal | None | **Synthetic** — backend generates on departure timeout |
| `reporting` | Internal | None | **Synthetic** — backend generates |
| `walking_to_desk` | Internal | None | **Synthetic** — frontend animation state |
| `waiting` | Internal | None | **Synthetic** — frontend animation state |
| `leaving` | Internal | None | **Synthetic** — frontend animation state |
| `error` | Internal | None | **Synthetic** — backend generates |

### Mapping Summary

- **7/19 events:** Full mapping from Gemini CLI hooks
- **4/19 events:** Partial mapping (subagent lifecycle inferred from tool calls)
- **8/19 events:** Synthetic (generated by backend/frontend, not from any hook source)

The 8 synthetic events are the same regardless of event source — they're generated by the backend state machine and frontend animation system. Only the 11 hook-sourced events matter for adapter parity.

**Bottom line: 7 fully covered + 4 partially covered = ~85% event coverage from Gemini CLI hooks.**

### Subagent Handling Detail

This is the most significant mapping challenge. Claude Office's core visual metaphor (boss spawning employees) depends heavily on subagent lifecycle events.

**Claude Code approach (current):**
- `PreToolUse` with `tool_name in ("Task", "Agent")` → remap to `subagent_start`
- `PostToolUse` with `tool_name in ("Task", "Agent")` → remap to `subagent_stop`
- `SubagentStart` → `subagent_info` (native subagent metadata with `agent_id`)
- `SubagentStop` → completion with transcript data

**Gemini CLI approach (proposed):**
- `BeforeTool` with `tool_name == "activate_skill"` → remap to `subagent_start`
- `AfterTool` with `tool_name == "complete_task"` → remap to `subagent_stop`
- No native `SubagentStart`/`SubagentStop` — must extract agent metadata from `tool_input`
- No `agent_id` field — must synthesize one from `tool_use_id` or session context

**Gemini CLI subagent input fields available:**

```json
// BeforeTool(activate_skill) input
{
  "tool_name": "activate_skill",
  "tool_input": {
    "skill_name": "codebase_investigator",
    "prompt": "Analyze the authentication module..."
  }
}

// AfterTool(complete_task) input
{
  "tool_name": "complete_task",
  "tool_input": {},
  "tool_response": {
    "llmContent": "Analysis complete. Found 3 issues...",
    "returnDisplay": "..."
  }
}
```

**Strategy:** Generate `agent_id` from the `tool_use_id` of the `activate_skill` call (same pattern as Claude Code's `_handle_pre_tool_use` at `event_mapper.py:115-135`). Track active skill invocations to match `complete_task` results back to their originating calls.

---

## New Visual Opportunities

Gemini CLI hooks expose capabilities that Claude Code does not. These enable novel visualizations.

### 1. LLM Thinking Animation (`BeforeModel` / `AfterModel`)

**What:** Intercept every LLM call and response chunk.

**Visual concept:**
- Boss enters "deep thinking" state with the model name displayed (e.g., "gemini-2.5-pro")
- Token counter ticks up in real-time as `AfterModel` fires per streaming chunk
- Thought bubble shows token usage: `IN: 1,247 | OUT: 389 | Total: 1,636`
- Duration timer shows how long the LLM call takes

**Data available from `AfterModel`:**
```json
{
  "llm_response": {
    "usageMetadata": { "totalTokenCount": 1636 }
  }
}
```

**New EventType proposals:**
```python
LLM_CALL_START = "llm_call_start"    # BeforeModel
LLM_CALL_CHUNK = "llm_call_chunk"    # AfterModel (per chunk)
LLM_CALL_END = "llm_call_end"        # AfterModel (final chunk)
```

### 2. Tool Selection Roulette (`BeforeToolSelection`)

**What:** Intercept the tool selection phase before the LLM picks which tools to use.

**Visual concept:**
- Slot-machine animation showing available tools spinning before one is selected
- Shows which tools were available vs. which were selected
- Could show a "tool palette" on the whiteboard with highlights

**Data available:**
```json
{
  "hookSpecificOutput": {
    "toolConfig": {
      "mode": "ANY",
      "allowedFunctionNames": ["read_file", "grep_search", "replace"]
    }
  }
}
```

### 3. Agent Retry Loop (`AfterAgent` denial)

**What:** When `AfterAgent` returns `decision: "deny"`, Gemini CLI automatically retries with feedback.

**Visual concept:**
- Boss throws paper in trash (rejected work)
- Red "RETRY" stamp appears
- Boss goes back to desk with feedback visible in bubble
- Counter shows retry attempt number

**Data available:**
```json
{
  "decision": "deny",
  "reason": "Response missing required summary section",
  "stop_hook_active": true  // indicates retry sequence
}
```

### 4. Tool Chaining (`tailToolCallRequest`)

**What:** `AfterTool` can request a follow-up tool call via `tailToolCallRequest`.

**Visual concept:**
- Conveyer belt animation: tool A result feeds directly into tool B
- Shows the chaining pipeline on the whiteboard
- Arrow between desk activities

**Data available:**
```json
{
  "hookSpecificOutput": {
    "tailToolCallRequest": {
      "name": "run_shell_command",
      "args": { "command": "npm test" }
    }
  }
}
```

### 5. Tool Argument Rewriting (`BeforeTool` tool_input override)

**What:** `BeforeTool` can merge/override `tool_input` arguments.

**Visual concept:**
- Boss scribbles out original args and writes new ones
- Diff-style animation showing what changed

---

## Gaps and Limitations

### Critical Gaps

| Gap | Impact | Mitigation |
|:---|:---|:---|
| No native subagent lifecycle | Boss/employee spawning is less reliable | Infer from `activate_skill`/`complete_task` tool calls |
| No `agent_id` in subagent events | Can't track individual subagents across start/stop | Synthesize from `tool_use_id`, track active skills |
| `Notification(ToolPermission)` is advisory only | Can't show permission dialog blocking | Show as one-way notification (phone rings but no waiting state) |
| Only `command` handler type | Must shell out for HTTP forwarding | Same pattern as current hooks (already proven) |
| No `thinking` blocks in model output | Can't show agent reasoning | Extract from `AfterModel` response chunks |

### Moderate Gaps

| Gap | Impact | Mitigation |
|:---|:---|:---|
| No `transcript_path` for subagent sessions | Can't poll subagent conversations | Show main conversation only |
| Different tool names (e.g., `replace` vs `Edit`) | Whiteboard tool stats need name mapping | Add tool name translation layer in event mapper |
| `SessionEnd` is best-effort (CLI won't wait) | May miss session end events | Add heartbeat/timeout detection in backend |
| No `background_task` equivalent | No background agent notification | Omit or use `AfterTool` with `run_in_background` flag |

### Tool Name Translation Table

For whiteboard tool usage statistics, translate Gemini CLI tool names to Claude Code equivalents:

| Gemini CLI Tool | Maps to Claude Code Tool | For Whiteboard Display |
|:---|:---|:---|
| `run_shell_command` | `Bash` | "Terminal" |
| `read_file` / `read_many_files` | `Read` | "Read File" |
| `write_file` | `Write` | "Write File" |
| `replace` | `Edit` | "Edit File" |
| `grep_search` | `Grep` | "Search" |
| `glob` | `Glob` | "Find Files" |
| `list_directory` | (no equivalent) | "List Dir" |
| `google_web_search` | `WebSearch` | "Web Search" |
| `web_fetch` | (no equivalent) | "Fetch URL" |
| `ask_user` | `AskUserQuestion` | "Ask User" |
| `activate_skill` | `Skill` | "Activate Skill" |
| `complete_task` | (subagent stop) | "Complete Task" |
| `write_todos` | `TodoWrite` | "Write Todos" |
| `save_memory` | (no equivalent) | "Save Memory" |

---

## Architecture: Integration Design

### High-Level Data Flow

```
┌─────────────────┐
│   Gemini CLI     │
│                  │
│  BeforeTool ─────┼──stdin/json──►┐
│  AfterTool  ─────┼──stdin/json──►│
│  BeforeAgent ────┼──stdin/json──►│
│  AfterAgent  ────┼──stdin/json──►│  ┌──────────────────────────┐
│  BeforeModel ────┼──stdin/json──►│  │  gemini-office-hook      │
│  AfterModel  ────┼──stdin/json──►├─►│  (CLI entry point)       │
│  SessionStart ───┼──stdin/json──►│  │                          │
│  SessionEnd  ────┼──stdin/json──►│  │  gemini_event_mapper.py  │
│  PreCompress ────┼──stdin/json──►│  │  ├─ map_gemini_event()   │
│  Notification ───┼──stdin/json──►┘  │  ├─ translate tool names  │
│                  │                  │  └─ infer subagent IDs     │
└─────────────────┘                  └────────────┬───────────────┘
                                                     │
                                                     │ HTTP POST
                                                     ▼
┌──────────────────────────────────────────────────────────────────┐
│  Backend (FastAPI :8000)                                         │
│                                                                  │
│  POST /api/v1/events                                             │
│    ├─ Event model (shared between Claude Code & Gemini sources)  │
│    ├─ EventProcessor.process_event()                             │
│    │   ├─ Persist to SQLite                                      │
│    │   ├─ StateMachine.transition()                              │
│    │   └─ Handler modules (agent, tool, conversation, session)   │
│    └─ WebSocket broadcast                                        │
│                                                                  │
│  ws://localhost:8000/ws/{session_id}                             │
│    ├─ state_update (GameState)                                   │
│    ├─ event (HistoryEntry)                                       │
│    └─ error                                                      │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  Frontend (Next.js :3000 + PixiJS)                               │
│                                                                  │
│  useWebSocketEvents → gameStore (Zustand)                        │
│    ├─ BossSprite (boss state, bubble, LLM token counter)        │
│    ├─ AgentSprite[] (arrive, work, depart choreography)          │
│    ├─ Whiteboard (tool stats, news, file edits)                  │
│    ├─ Elevator (context compaction animation)                    │
│    └─ Conversation panel (user prompts, tool calls, responses)  │
└──────────────────────────────────────────────────────────────────┘
```

### File Changes Required

```
hooks/
├── src/claude_office_hooks/
│   ├── main.py                    # UNCHANGED (Claude Code entry point)
│   ├── event_mapper.py            # UNCHANGED (Claude Code event mapping)
│   ├── gemini_event_mapper.py     # NEW — Gemini CLI event mapping adapter
│   ├── gemini_hook.py             # NEW — Gemini CLI hook entry point
│   ├── config.py                  # UNCHANGED
│   └── debug_logger.py            # UNCHANGED
├── manage_hooks.py                # UNCHANGED (Claude Code hook installer)
├── manage_gemini_hooks.py         # NEW — Gemini CLI hook installer
└── pyproject.toml                 # UPDATE — add gemini-office-hook entry point

backend/
├── app/models/events.py           # UPDATE — add new EventType values for Model events
├── app/core/event_processor.py    # UNCHANGED (processes generic Event model)
├── app/core/state_machine.py      # UPDATE — handle new event types (llm_call_start, etc.)
├── app/core/handlers/             # UNCHANGED (handler interface is event-type based)
└── app/api/                       # UNCHANGED

frontend/
├── src/stores/gameStore.ts        # UPDATE — new state for LLM token tracking, tool selection
├── src/machines/                  # UNCHANGED (animation choreography)
├── src/components/                # UPDATE — boss LLM thinking animation
└── src/hooks/useWebSocketEvents.ts # UNCHANGED (consumes generic state updates)

# Optional: Gemini CLI extension packaging
gemini-extension/
├── gemini-extension.json          # NEW — extension manifest
├── hooks/
│   └── hooks.json                 # NEW — hook definitions for all 11 events
├── agents/
│   └── office-visualizer.md       # NEW — sub-agent prompt for office-specific tasks
└── README.md                      # NEW
```

### Shared Backend Contract

The backend's `Event` model (`backend/app/models/events.py:81-87`) is already source-agnostic. The `EventData` model accepts optional fields — Gemini CLI events simply populate different subsets of the same fields:

```python
# Claude Code event (existing)
Event(
    event_type=EventType.PRE_TOOL_USE,
    session_id="sess_abc",
    data=EventData(
        tool_name="Bash",
        tool_input={"command": "make test"},
        agent_id="main",
    )
)

# Gemini CLI event (new adapter, same model)
Event(
    event_type=EventType.PRE_TOOL_USE,
    session_id="sess_xyz",       # from GEMINI_SESSION_ID
    data=EventData(
        tool_name="run_shell_command",  # will be translated to "Bash" by mapper
        tool_input={"command": "make test"},
        agent_id="main",
    )
)
```

---

## Implementation Plan

### Phase 1: Core Event Mapper (Foundation)

**Goal:** Get basic Gemini CLI events flowing into Claude Office with equivalent visualization to Claude Code.

**Files to create/modify:**

| File | Action | Description |
|:---|:---|:---|
| `hooks/src/claude_office_hooks/gemini_event_mapper.py` | Create | Map all 11 Gemini events to Claude Office EventType values |
| `hooks/src/claude_office_hooks/gemini_hook.py` | Create | CLI entry point for Gemini hooks (reads stdin, calls mapper, POSTs to backend) |
| `hooks/manage_gemini_hooks.py` | Create | Install/uninstall hooks into `~/.gemini/settings.json` |
| `hooks/pyproject.toml` | Modify | Add `gemini-office-hook` console script entry point |

**Event mapping implementation:**

```python
# gemini_event_mapper.py — core mapping logic

GEMINI_TO_CLAUDE_TOOL_MAP: dict[str, str] = {
    "run_shell_command": "Bash",
    "read_file": "Read",
    "read_many_files": "Read",
    "write_file": "Write",
    "replace": "Edit",
    "grep_search": "Grep",
    "glob": "Glob",
    "list_directory": "Glob",
    "google_web_search": "WebSearch",
    "web_fetch": "WebFetch",
    "ask_user": "AskUserQuestion",
    "activate_skill": "Skill",
    "write_todos": "TodoWrite",
}

SUBAGENT_TOOLS = frozenset({"activate_skill", "complete_task"})

def map_gemini_event(hook_event: str, raw_data: dict) -> dict | None:
    """Map a Gemini CLI hook event to a Claude Office event payload."""
    event_type = _resolve_event_type(hook_event, raw_data)
    if event_type is None:
        return None

    session_id = raw_data.get("session_id", "unknown")
    data = _extract_common_data(raw_data)
    _apply_event_specific_mapping(hook_event, event_type, raw_data, data)

    return {
        "event_type": event_type,
        "session_id": session_id,
        "timestamp": get_iso_timestamp(),
        "data": data,
    }

def _resolve_event_type(hook_event: str, raw_data: dict) -> str | None:
    """Resolve the Claude Office EventType from a Gemini hook event."""
    tool_name = raw_data.get("tool_name", "")

    match hook_event:
        case "SessionStart":
            return "session_start"
        case "SessionEnd":
            return "session_end"
        case "BeforeTool":
            if tool_name in SUBAGENT_TOOLS:
                return "subagent_start"
            return "pre_tool_use"
        case "AfterTool":
            if tool_name in SUBAGENT_TOOLS:
                return "subagent_stop"
            return "post_tool_use"
        case "BeforeAgent":
            return "user_prompt_submit"
        case "AfterAgent":
            return "stop"
        case "PreCompress":
            return "context_compaction"
        case "Notification":
            ntype = raw_data.get("notification_type", "")
            if ntype == "ToolPermission":
                return "permission_request"
            return "notification"
        case _:
            return None  # BeforeModel, AfterModel, BeforeToolSelection — Phase 2
```

**Hook installation script:**

```python
# manage_gemini_hooks.py — installs hooks into ~/.gemini/settings.json

GEMINI_HOOK_EVENTS = [
    ("BeforeTool", ".*"),
    ("AfterTool", ".*"),
    ("BeforeAgent", ""),
    ("AfterAgent", ""),
    ("SessionStart", "startup"),
    ("SessionEnd", "exit"),
    ("PreCompress", ""),
    ("Notification", ""),
]

def get_gemini_settings_path() -> Path:
    if os.environ.get("GEMINI_CONFIG_DIR"):
        return Path(os.environ["GEMINI_CONFIG_DIR"]) / "settings.json"
    return Path.home() / ".gemini" / "settings.json"
```

**Verification:**
- Run Gemini CLI with hooks installed
- Confirm events appear in Claude Office backend logs
- Confirm boss reacts to tool calls, session start/end, and context compaction
- `make checkall` passes

### Phase 2: Model Event Visualizations (Enhancement)

**Goal:** Add visualizations for `BeforeModel`/`AfterModel`/`BeforeToolSelection` — capabilities unique to Gemini CLI.

**Files to modify:**

| File | Action | Description |
|:---|:---|:---|
| `backend/app/models/events.py` | Modify | Add `LLM_CALL_START`, `LLM_CALL_CHUNK`, `LLM_CALL_END`, `TOOL_SELECTION` to EventType |
| `backend/app/core/state_machine.py` | Modify | Handle new event types, track LLM token usage, active model name |
| `backend/app/models/sessions.py` | Modify | Add `llm_state` to GameState (model name, tokens, latency) |
| `frontend/src/stores/gameStore.ts` | Modify | Add LLM state tracking, tool selection state |
| `frontend/src/components/BossSprite.tsx` | Modify | Add "thinking" animation with model name and token counter |
| `frontend/src/components/Whiteboard.tsx` | Modify | Add tool selection display |
| `hooks/src/claude_office_hooks/gemini_event_mapper.py` | Modify | Add BeforeModel/AfterModel/BeforeToolSelection mapping |

**New EventType enum values:**

```python
class EventType(StrEnum):
    # ... existing values ...
    LLM_CALL_START = "llm_call_start"      # BeforeModel
    LLM_CALL_CHUNK = "llm_call_chunk"      # AfterModel (per streaming chunk)
    LLM_CALL_END = "llm_call_end"          # AfterModel (final chunk)
    TOOL_SELECTION = "tool_selection"       # BeforeToolSelection
```

**New GameState fields:**

```python
class LLMState(BaseModel):
    active: bool = False
    model_name: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    call_start_time: datetime | None = None
    chunk_count: int = 0

class GameState(BaseModel):
    # ... existing fields ...
    llm: LLMState = Field(default_factory=LLMState)
    available_tools: list[str] = Field(default_factory=list)
```

**Verification:**
- Boss shows "thinking" state with model name during LLM calls
- Token counter increments in real-time during streaming
- Tool selection shows on whiteboard before tool is picked
- Existing Claude Code visualization still works (new events are no-ops for Claude Code source)

### Phase 3: Extension Packaging (Distribution)

**Goal:** Package as a Gemini CLI extension for one-command install.

**Files to create:**

| File | Action | Description |
|:---|:---|:---|
| `gemini-extension/gemini-extension.json` | Create | Extension manifest |
| `gemini-extension/hooks/hooks.json` | Create | Hook definitions for all 11 events |
| `gemini-extension/agents/office-visualizer.md` | Create | Sub-agent prompt |
| `gemini-extension/scripts/install.sh` | Create | Post-install setup (backend deps, port check) |
| `gemini-extension/README.md` | Create | Installation and usage docs |

**Extension manifest:**

```json
{
  "name": "claude-office-gemini",
  "version": "0.14.0",
  "description": "Real-time pixel art office simulation for Gemini CLI",
  "entry_point": "hooks/hooks.json",
  "hooks": "hooks/hooks.json",
  "repository": "https://github.com/paulrobello/claude-office"
}
```

**Verification:**
- `gemini extensions install` succeeds
- Hooks are automatically registered
- Backend and frontend start correctly
- Full visualization works end-to-end

---

## Comparison: Codex CLI vs Gemini CLI vs Claude Code

| Dimension | Claude Code | Gemini CLI | OpenAI Codex CLI |
|:---|:---|:---|:---|
| **Hook events** | 20+ (11 hooked + synthetic) | 11 | 5 |
| **Handler types** | `command`, `http`, `prompt`, `agent` | `command` only | `command` only |
| **Tool interception** | All tools | All tools | Bash only |
| **File write hooks** | Yes | Yes (`write_file`, `replace`) | No (bug #16732) |
| **Subagent events** | Yes (native `SubagentStart`/`SubagentStop`) | Inferred (`activate_skill`/`complete_task`) | No |
| **LLM call hooks** | No | Yes (`BeforeModel`/`AfterModel`) | No |
| **Tool selection hooks** | No | Yes (`BeforeToolSelection`) | No |
| **Context compaction** | Yes (`PreCompact`) | Yes (`PreCompress`) | No |
| **Retry mechanism** | No | Yes (`AfterAgent` denial) | No |
| **Tool chaining** | No | Yes (`tailToolCallRequest`) | No |
| **Extension system** | Skills/Plugins | Full extension packaging | None |
| **Telemetry** | None built-in | OpenTelemetry | None |
| **Status** | Production | Production (v0.26.0+) | Experimental (feature-flagged) |
| **Claude Office coverage** | 100% (native) | ~85% | ~25% |

### Verdict

| CLI | Claude Office Viability | Recommendation |
|:---|:---|:---|
| **Claude Code** | 100% — native, all events | Current source, maintain |
| **Gemini CLI** | 85% — viable, plus unique Model events | Proceed with integration |
| **OpenAI Codex CLI** | 25% — too limited | Skip, monitor issues #16732 and #14754 |

---

## Session Transcript Format

Gemini CLI stores full session transcripts as **append-only JSONL files**. This is critical for Claude Office's transcript polling pattern (reading conversation data, tool results, and thinking blocks from disk).

### Storage Location

```
~/.gemini/tmp/<sha256-of-project-root>/chats/
  session-2026-04-11T20-15-a1b2c3d4.jsonl    # Main session
  session-2026-04-11T18-30-e5f67890.jsonl    # Another session
  a1b2c3d4-e5f6-7890-abcd-ef1234567890/      # Subagent directory
    <subagent-uuid>.jsonl                      # Subagent sessions
```

- `<sha256-of-project-root>` is SHA-256 of the project's absolute path (computed in `packages/core/src/utils/paths.ts`)
- File naming: `session-<YYYY-MM-DDTHH-MM>-<first-8-chars-of-session-uuid>.jsonl`
- Legacy `.json` files are auto-migrated to `.jsonl` on resume
- `GEMINI_CLI_HOME` env var overrides `~`

### JSONL Record Types

Each line is a self-contained JSON object. Four record types:

#### 1. Initial Metadata (first line)

```json
{
  "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "projectHash": "abc123...",
  "startTime": "2026-04-11T20:15:00.000Z",
  "lastUpdated": "2026-04-11T20:15:00.000Z",
  "kind": "main"
}
```

#### 2. Message Records

```json
{
  "id": "uuid-msg1",
  "timestamp": "2026-04-11T20:15:01.000Z",
  "type": "user",
  "content": "Help me refactor this module"
}
```

```json
{
  "id": "uuid-msg2",
  "timestamp": "2026-04-11T20:15:03.000Z",
  "type": "gemini",
  "content": [{"text": "I'll help with that!"}],
  "model": "gemini-2.5-pro",
  "tokens": {
    "input": 150,
    "output": 45,
    "cached": 0,
    "thoughts": 20,
    "tool": 0,
    "total": 215
  },
  "thoughts": [
    {
      "subject": "Planning",
      "description": "Analyzing the code structure...",
      "timestamp": "2026-04-11T20:15:02.000Z"
    }
  ],
  "toolCalls": [
    {
      "id": "call-001",
      "name": "read_file",
      "args": {"path": "src/main.py"},
      "status": "completed",
      "timestamp": "2026-04-11T20:15:04.000Z",
      "displayName": "Read File",
      "result": [{"text": "# file contents here..."}]
    }
  ]
}
```

Message types: `"user"`, `"gemini"`, `"info"`, `"error"`, `"warning"`

#### 3. Metadata Updates

```json
{"$set": {"lastUpdated": "2026-04-11T20:20:00.000Z"}}
{"$set": {"summary": "Fixed the authentication bug"}}
```

#### 4. Rewind Records

```json
{"$rewindTo": "uuid-msg5"}
```

### Key Schemas

**TokensSummary:**
```typescript
{
  input: number;      // promptTokenCount
  output: number;     // candidatesTokenCount
  cached: number;     // cachedContentTokenCount
  thoughts?: number;  // thoughtsTokenCount
  tool?: number;      // toolUsePromptTokenCount
  total: number;      // totalTokenCount
}
```

**ToolCallRecord:**
```typescript
{
  id: string;                      // Tool call UUID
  name: string;                    // e.g., "read_file", "run_shell_command"
  args: Record<string, unknown>;   // Tool arguments
  result?: PartListUnion | null;   // Tool execution result
  status: string;                  // Execution status
  timestamp: string;               // ISO 8601
  agentId?: string;                // Subagent ID if applicable
  displayName?: string;            // Human-readable name
}
```

**ThoughtSummary:**
```typescript
{
  subject: string;       // Topic of the thought
  description: string;   // Detailed reasoning text
  timestamp: string;     // ISO 8601
}
```

### Transcript Path in Hooks

The `transcript_path` field is populated in every hook's stdin JSON via `ChatRecordingService.getConversationFilePath()`. It provides the **absolute path** to the active `.jsonl` session file.

```json
{
  "session_id": "a1b2c3d4-...",
  "transcript_path": "/Users/user/.gemini/tmp/abc123.../chats/session-2026-04-11T20-15-a1b2c3d4.jsonl",
  "cwd": "/workspace",
  "hook_event_name": "BeforeTool",
  "timestamp": "2026-04-11T20:15:00Z"
}
```

### Polling Strategy for Claude Office

Claude Office currently polls Claude Code's JSONL transcripts to extract conversation history and thinking blocks. The same pattern works for Gemini CLI:

1. **Receive `transcript_path`** from `SessionStart` hook (store in backend session state)
2. **Track byte position** after each read
3. **Poll periodically** (seek to last position, read new lines)
4. **Parse each line** as JSON, dispatch by record type:
   - `type: "user"` → conversation entry (user prompt)
   - `type: "gemini"` → conversation entry (assistant response + tool calls + thoughts)
   - `type: "info"/"warning"/"error"` → system messages
   - `$set` → metadata updates (e.g., session summary)
   - `$rewindTo` → conversation rollback

```python
class GeminiTranscriptWatcher:
    """Watches a Gemini CLI JSONL session file for new records."""

    def __init__(self, file_path: Path):
        self.file_path = file_path
        self.position = 0

    def read_new_records(self) -> list[dict]:
        """Read and parse any new JSONL records since last check."""
        records = []
        try:
            with open(self.file_path, encoding="utf-8") as f:
                f.seek(self.position)
                for line in f:
                    line = line.strip()
                    if line:
                        try:
                            records.append(json.loads(line))
                        except json.JSONDecodeError:
                            pass
                self.position = f.tell()
        except FileNotFoundError:
            pass
        return records
```

### Data Available for Visualization

| Data | Source | Claude Office Visual |
|:---|:---|:---|
| User prompts | `type: "user"` messages | Boss speech bubble |
| Assistant responses | `type: "gemini"` content | Boss speech bubble |
| Tool calls | `toolCalls[]` on gemini messages | Whiteboard tool stats, desk activity |
| Tool results | `toolCalls[].result` | Agent bubble content |
| Thinking/reasoning | `thoughts[]` on gemini messages | Boss thought bubble |
| Token counts | `tokens` on gemini messages | Token counter display |
| Model name | `model` on gemini messages | Boss "thinking" state label |
| Session summary | `$set.summary` | Session list display |
| Errors/warnings | `type: "error"/"warning"` | Error indicator |
| Subagent conversations | Nested `.jsonl` files | Agent conversation panel |

### Comparison with Claude Code Transcripts

| Aspect | Claude Code | Gemini CLI |
|:---|:---|:---|
| File format | JSONL | JSONL (was JSON, migrated) |
| Storage path | `~/.claude/projects/<path-hash>/` | `~/.gemini/tmp/<sha256>/chats/` |
| File naming | `<timestamp>.jsonl` | `session-<timestamp>-<shortId>.jsonl` |
| Hook `transcript_path` | Direct path to JSONL | Direct path to JSONL |
| Auto-save | Every message | Every message (append-only) |
| Subagent storage | Nested in main session dir | Separate files in subdirectory |
| Tool call recording | Inline in messages | `toolCalls[]` array on messages |
| Token tracking | Per-turn | Per-message with 6-field breakdown |
| Thinking/reasoning | In message content | `thoughts[]` array |
| Session summary | No | Auto-generated 1-line summary |
| Rewind support | No record | `$rewindTo` records |
| Session resume | `--resume` flag | `--resume` + `/resume` browser |
| Retention config | No | `sessionRetention` in settings.json |

### Integration with Existing Transcript Poller

Claude Office's backend already has transcript polling infrastructure in `backend/app/core/handlers/session_handler.py`. For Gemini CLI:

1. Add a `GeminiTranscriptWatcher` class alongside the existing Claude Code poller
2. Both pollers implement the same interface: `read_new_records() -> list[dict]`
3. The backend dispatches to the correct poller based on session source (Claude Code vs Gemini CLI)
4. Parsed records feed into the same `conversation_handler` for bubble/speech content

The key difference is that Gemini CLI transcripts include **richer per-message data** (token breakdowns, thought summaries, tool call arrays) that can enhance the visualization beyond what Claude Code transcripts provide.

---

## Sources

- [Gemini CLI Hooks Documentation](https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/index.md)
- [Hooks Reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md)
- [Writing Hooks Guide](https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/writing-hooks.md)
- [Hooks Best Practices](https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/best-practices.md)
- [Extensions Documentation](https://github.com/google-gemini/gemini-cli/blob/main/docs/extensions/index.md)
- [Extensions Reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/extensions/reference.md)
- [Configuration Reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md)
- [Tools Reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/tools.md)
- [Policy Engine](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md)
- [Telemetry](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/telemetry.md)
- [Google Developers Blog: Hooks Announcement](https://developers.googleblog.com/tailor-gemini-cli-to-your-workflow-with-hooks/)
- [DeepWiki: Gemini CLI Hooks System Architecture](https://deepwiki.com/google-gemini/gemini-cli/5.7-hooks-system)
- [Codex CLI Issue #16732 — apply_patch hook support](https://github.com/openai/codex/issues/16732)
- [Codex CLI Issue #14754 — expanded tool interception](https://github.com/openai/codex/issues/14754)
- [Codex CLI Hooks Documentation](https://github.com/openai/codex/blob/main/docs/hooks/index.md)
- [ChatRecordingService Source](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/services/chatRecordingService.ts)
- [ChatRecordingTypes Source](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/services/chatRecordingTypes.ts)
- [HookEventHandler (createBaseInput)](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/hooks/hookEventHandler.ts)
- [Session Management Docs](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/session-management.md)
- [JSONL Migration Issue #15292](https://github.com/google-gemini/gemini-cli/issues/15292)
- [DeepWiki: Session Management](https://deepwiki.com/google-gemini/gemini-cli/3.9-session-management)
- Vault note: `~/ClaudeVault/Tools/google-gemini-cli-hooks.md`
- Vault note: `~/ClaudeVault/Tools/google-gemini-cli-transcripts.md`
- Vault note: `~/ClaudeVault/Tools/openai-codex-hooks.md`
- Local reference repo: `~/Repos/gemini-cli`
