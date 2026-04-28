---
date: 2026-04-11
type: tool
tags: [google, gemini, hook, coding-agent, cli, extension, lifecycle, telemetry]
confidence: high
sources:
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/index.md
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/writing-hooks.md
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/best-practices.md
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/extensions/index.md
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/extensions/reference.md
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/tools.md
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/telemetry.md
  - https://developers.googleblog.com/tailor-gemini-cli-to-your-workflow-with-hooks/
  - https://github.com/google-gemini/gemini-cli/issues/9070
  - https://github.com/google-gemini/gemini-cli/issues/2779
  - https://deepwiki.com/google-gemini/gemini-cli/5.7-hooks-system
  - https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/services/chatRecordingService.ts
  - https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/services/chatRecordingTypes.ts
  - https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/hooks/types.ts
  - https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/hooks/hookEventHandler.ts
  - https://github.com/google-gemini/gemini-cli/issues/15292
related: ["[[hooks-guide]]", "[[openai-codex-hooks]]", "[[code-hooks-integration]]", "[[google-gemini-image-generation-api-and-nanobanana-mcp-server]]", "[[google-gemini-cli-transcripts]]"]
---

# Google Gemini CLI Hooks System

## Overview

Google Gemini CLI is an open-source AI coding agent that runs in the terminal,
similar to Claude Code and OpenAI Codex. Since version **v0.26.0** (introduced
early 2026), it features a comprehensive hooks system that allows developers to
intercept and customize the agentic loop at 11 distinct lifecycle points.

Hooks are **scripts or programs** that Gemini CLI executes at specific points in
the agent loop. They run **synchronously** -- when a hook event fires, Gemini
CLI waits for all matching hooks to complete before continuing. Hooks communicate
via JSON-over-stdin/stdout, following a contract very similar to Claude Code's
hooks system.

Repository: <https://github.com/google-gemini/gemini-cli>

## Hook Events (Lifecycle Points)

Gemini CLI exposes 11 hook events across four categories:

### Tool Events

| Event | When It Fires | Impact | Common Use Cases |
|:---|:---|:---|:---|
| `BeforeTool` | Before a tool is invoked | Block Tool / Rewrite | Validate arguments, block dangerous ops |
| `AfterTool` | After a tool executes | Block Result / Context | Process results, run tests, hide results |

### Agent Events

| Event | When It Fires | Impact | Common Use Cases |
|:---|:---|:---|:---|
| `BeforeAgent` | After user submits prompt, before planning | Block Turn / Context | Add context, validate prompts, block turns |
| `AfterAgent` | When agent loop ends (final response) | Retry / Halt | Review output, force retry or halt execution |

### Model Events

| Event | When It Fires | Impact | Common Use Cases |
|:---|:---|:---|:---|
| `BeforeModel` | Before sending request to LLM | Block Turn / Mock | Modify prompts, swap models, mock responses |
| `BeforeToolSelection` | Before LLM selects tools | Filter Tools | Filter available tools, optimize selection |
| `AfterModel` | After receiving LLM response (every chunk) | Block Turn / Redact | Filter/redact responses, PII filtering |

### Lifecycle / System Events

| Event | When It Fires | Impact | Common Use Cases |
|:---|:---|:---|:---|
| `SessionStart` | On startup, resume, or `/clear` | Advisory (Inject Context) | Initialize resources, load context |
| `SessionEnd` | On exit or clear | Advisory | Clean up, save state |
| `PreCompress` | Before context compression | Advisory | Save state, notify user |
| `Notification` | On system alerts (tool permissions, etc.) | Advisory | Forward to desktop alerts, logging |

## Communication Contract

### The "Golden Rule" (Strict JSON)

Hooks communicate via stdin (input) and stdout (output):

1. **Silence is Mandatory**: stdout must contain only the final JSON object.
   Even a single `echo` before the JSON will break parsing.
2. **Pollution = Failure**: Non-JSON text in stdout causes parsing failure.
   CLI defaults to "Allow" and treats output as a `systemMessage`.
3. **Debug via Stderr**: Use stderr for all logging and debugging.
   Gemini CLI captures stderr but never parses it as JSON.

### Exit Codes

| Exit Code | Label | Behavioral Impact |
|:---|:---|:---|
| **0** | Success | stdout is parsed as JSON. Preferred for all logic including intentional blocks. |
| **2** | System Block | Critical block. Target action is aborted. stderr used as rejection reason. |
| **Other** | Warning | Non-fatal failure. CLI continues with original parameters. |

### Base Input Schema (All Hooks)

All hooks receive these common fields via stdin:

```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.json",
  "cwd": "/workspace",
  "hook_event_name": "BeforeTool",
  "timestamp": "2026-03-03T10:30:00Z"
}
```

### Common Output Fields

Most hooks support these fields in their stdout JSON:

| Field | Type | Description |
|:---|:---|:---|
| `systemMessage` | string | Displayed to user in terminal |
| `suppressOutput` | boolean | Hide internal hook metadata from logs/telemetry |
| `continue` | boolean | If `false`, stops entire agent loop immediately |
| `stopReason` | string | Displayed when `continue` is `false` |
| `decision` | string | `"allow"` or `"deny"` (alias `"block"`) |
| `reason` | string | Feedback/error when `decision` is `"deny"` |

## Per-Event Input/Output Details

### BeforeTool

Additional input fields:
- `tool_name` (string): Name of the tool being called
- `tool_input` (object): Raw arguments generated by the model
- `mcp_context` (object): Optional metadata for MCP-based tools
- `original_request_name` (string): Original tool name if tail tool call

Additional output fields:
- `hookSpecificOutput.tool_input`: Object that **merges with and overrides** model arguments
- `decision: "deny"` prevents tool execution; `reason` is sent to the agent

### AfterTool

Additional input fields:
- `tool_name` (string)
- `tool_input` (object): Original arguments
- `tool_response` (object): Result containing `llmContent`, `returnDisplay`, optional `error`
- `mcp_context` (object)

Additional output fields:
- `hookSpecificOutput.additionalContext`: Text appended to tool result
- `hookSpecificOutput.tailToolCallRequest`: `{ name, args }` for chaining another tool call

### BeforeAgent

Additional input fields:
- `prompt` (string): Original text submitted by user

Additional output fields:
- `hookSpecificOutput.additionalContext`: Text appended to prompt for this turn

### AfterAgent

Additional input fields:
- `prompt` (string): User's original request
- `prompt_response` (string): Final text generated by agent
- `stop_hook_active` (boolean): True if already running in a retry sequence

Additional output fields:
- `hookSpecificOutput.clearContext`: If `true`, clears conversation history
- `decision: "deny"` rejects response and triggers automatic retry

### BeforeModel

Additional input fields:
- `llm_request` (object): Contains `model`, `messages`, and `config`

Additional output fields:
- `hookSpecificOutput.llm_request`: Overrides parts of outgoing request
- `hookSpecificOutput.llm_response`: Synthetic response; if provided, skips LLM call entirely

### BeforeToolSelection

Additional input fields:
- `llm_request` (object): Same format as BeforeModel

Additional output fields:
- `hookSpecificOutput.toolConfig.mode`: `"AUTO" | "ANY" | "NONE"`
- `hookSpecificOutput.toolConfig.allowedFunctionNames`: Whitelist of tool names
- **Union Strategy**: Multiple hooks' whitelists are **combined**

### AfterModel

Additional input fields:
- `llm_request` (object): Original request
- `llm_response` (object): Model response (or single chunk during streaming)

Additional output fields:
- `hookSpecificOutput.llm_response`: Object that replaces model response chunk

Note: Fires for **every chunk** generated by the model during streaming.

### SessionStart

Additional input fields:
- `source`: `"startup" | "resume" | "clear"`

Additional output fields:
- `hookSpecificOutput.additionalContext`: Injected as first turn (interactive) or prepended (non-interactive)

Advisory only: `continue` and `decision` fields are ignored.

### SessionEnd

Additional input fields:
- `reason`: `"exit" | "clear" | "logout" | "prompt_input_exit" | "other"`

Best effort: CLI will not wait for this hook; flow-control fields ignored.

### Notification

Additional input fields:
- `notification_type`: `"ToolPermission"`
- `message`: Summary of the alert
- `details`: JSON object with alert-specific metadata

Observability only: Cannot block alerts or grant permissions.

### PreCompress

Additional input fields:
- `trigger`: `"auto" | "manual"`

Advisory only: Fired asynchronously; cannot block or modify compression.

## Configuration

### Configuration Locations (Precedence, Highest to Lowest)

1. **Project settings**: `.gemini/settings.json` in current directory
2. **User settings**: `~/.gemini/settings.json`
3. **System settings**: `/etc/gemini-cli/settings.json` (Linux), `/Library/Application Support/GeminiCli/settings.json` (macOS)
4. **Extensions**: Hooks defined by installed extensions

### Configuration Schema

```json
{
  "hooks": {
    "BeforeTool": [
      {
        "matcher": "write_file|replace",
        "sequential": false,
        "hooks": [
          {
            "name": "security-scan",
            "type": "command",
            "command": "$GEMINI_PROJECT_DIR/.gemini/hooks/security.sh",
            "timeout": 5000,
            "description": "Scan for security issues"
          }
        ]
      }
    ],
    "AfterTool": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "name": "audit-log",
            "type": "command",
            "command": "./log-tool-usage.sh"
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "name": "load-context",
            "type": "command",
            "command": "./load-project-context.sh"
          }
        ]
      }
    ]
  }
}
```

### Hook Definition Fields

| Field | Type | Required | Description |
|:---|:---|:---|:---|
| `matcher` | string | No | Regex (for tools) or exact string (for lifecycle) to filter when hook runs |
| `sequential` | boolean | No | If `true`, hooks run one after another; `false` = parallel |
| `hooks` | array | Yes | Array of hook configurations |

### Hook Configuration Fields

| Field | Type | Required | Description |
|:---|:---|:---|:---|
| `type` | string | Yes | Execution engine. Currently only `"command"` supported |
| `command` | string | Yes* | Shell command to execute (required when type is `"command"`) |
| `name` | string | No | Friendly name for logs and CLI commands |
| `timeout` | number | No | Execution timeout in milliseconds (default: 60000) |
| `description` | string | No | Brief explanation of hook's purpose |

### Matchers

- **Tool events** (`BeforeTool`, `AfterTool`): Matchers are **regular expressions** (e.g. `"write_.*"`)
- **Lifecycle events**: Matchers are **exact strings** (e.g. `"startup"`)
- **Wildcards**: `"*"` or `""` (empty string) matches all occurrences

### Environment Variables

Hooks receive these environment variables:

- `GEMINI_PROJECT_DIR`: Absolute path to project root
- `GEMINI_SESSION_ID`: Unique ID for current session
- `GEMINI_CWD`: Current working directory
- `CLAUDE_PROJECT_DIR`: Alias for compatibility

## Built-in Tool Names (for Matchers)

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
| `get_internal_docs` | Think | Access Gemini CLI docs |
| `save_memory` | Think | Persist facts to GEMINI.md |
| `enter_plan_mode` | Plan | Switch to read-only plan mode |
| `exit_plan_mode` | Plan | Finalize plan and start implementation |
| `google_web_search` | Search | Google web search |
| `web_fetch` | Fetch | Retrieve URL content |
| `complete_task` | Other | Finalize subagent mission |

MCP tools follow naming pattern: `mcp_<server_name>_<tool_name>`

## Extensions System

Gemini CLI has a full extension system that can package hooks along with other
capabilities.

### Extension Manifest (`gemini-extension.json`)

Extensions can bundle:
- **Hooks** (in `hooks/hooks.json`)
- **MCP Servers** (in manifest `mcpServers` field)
- **Custom Commands** (TOML files in `commands/` directory)
- **Agent Skills** (in `skills/` directory)
- **Sub-agents** (`.md` files in `agents/` directory)
- **Policy Rules** (`.toml` files in `policies/` directory)
- **Themes** (in manifest `themes` array)

### Extension Hooks

Extensions define hooks in a separate `hooks/hooks.json` file within the
extension directory. These hooks are merged with user/project settings at the
lowest precedence level.

### Extension Installation

```bash
gemini extensions install https://github.com/gemini-cli-extensions/workspace
gemini extensions list
gemini extensions update --all
gemini extensions uninstall <name>
```

### Extension Variable Substitution

| Variable | Description |
|:---|:---|
| `${extensionPath}` | Absolute path to extension directory |
| `${workspacePath}` | Absolute path to current workspace |
| `${/}` | Platform-specific path separator |

## Subagents

Gemini CLI supports built-in subagents that the main agent can delegate to:

| Subagent | Purpose |
|:---|:---|
| `codebase_investigator` | Analyze codebase, dependencies |
| `cli_help` | Expert knowledge about Gemini CLI |
| `generalist_agent` | Route tasks to specialized subagents |
| `browser_agent` (experimental) | Automate web browser tasks |

## Telemetry (OpenTelemetry)

Gemini CLI provides built-in OpenTelemetry integration for observability:

```json
{
  "telemetry": {
    "enabled": true,
    "target": "local",
    "outfile": ".gemini/telemetry.log",
    "logPrompts": true
  }
}
```

Configuration options:
- `enabled`: Enable/disable telemetry (default: `false`)
- `target`: `"gcp"` or `"local"`
- `otlpEndpoint`: OTLP collector endpoint
- `outfile`: Save telemetry to file
- `logPrompts`: Include prompts in telemetry logs
- `useCollector`: Use external OTLP collector
- `useCliAuth`: Use CLI credentials (GCP target only)

Supports export to Google Cloud Trace/Monitoring/Logging, Jaeger, Prometheus,
Datadog, or any OpenTelemetry backend.

## Policy Engine

A TOML-based policy engine provides fine-grained control over tool execution
with a tiered priority system:

| Tier | Base | Description |
|:---|:---|:---|
| Default | 1 | Built-in policies |
| Extension | 2 | Policies from extensions |
| Workspace | 3 | Workspace configuration |
| User | 4 | Custom user policies |
| Admin | 5 | Enterprise administrator policies |

```toml
[[rule]]
toolName = "run_shell_command"
commandPrefix = "rm -rf"
decision = "deny"
priority = 100
```

## Comparison with Claude Code Hooks

| Aspect | Gemini CLI | Claude Code |
|:---|:---|:---|
| Hook types | `command` only (currently) | `command`, `http`, `prompt`, `agent` |
| Lifecycle events | 11 events | 5 events |
| Communication | JSON stdin/stdout | JSON stdin/stdout |
| Matchers | Regex for tools, exact string for lifecycle | N/A (uses event names) |
| Configuration | `.gemini/settings.json` | `~/.claude/settings.json` |
| Exit codes | 0 (success), 2 (block), other (warning) | 0 (success), 2 (block) |
| Extensions | Full extension system with hooks | Skills/plugins |
| Tool rewriting | Yes (merge tool_input) | Limited |
| Tail tool calls | Yes (AfterTool) | No |
| Model mocking | Yes (BeforeModel synthetic response) | No |
| Tool filtering | Yes (BeforeToolSelection) | No |
| Retry mechanism | Yes (AfterAgent deny triggers retry) | No |

## Practical Examples

### Secret Scanner (BeforeTool)

```bash
#!/usr/bin/env bash
input=$(cat)
content=$(echo "$input" | jq -r '.tool_input.content // .tool_input.new_string // ""')

if echo "$content" | grep -qE 'api[_-]?key|password|secret'; then
  echo "Blocked potential secret" >&2
  cat <<EOF
{
  "decision": "deny",
  "reason": "Security Policy: Potential secret detected in content.",
  "systemMessage": "Security scanner blocked operation"
}
EOF
  exit 0
fi

echo '{"decision": "allow"}'
exit 0
```

### Context Injection (BeforeAgent)

```bash
#!/usr/bin/env bash
context=$(git log -5 --oneline 2>/dev/null || echo "No git history")

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "BeforeAgent",
    "additionalContext": "Recent commits:\n$context"
  }
}
EOF
```

### Response Validation with Retry (AfterAgent)

```javascript
#!/usr/bin/env node
const fs = require('fs');
const input = JSON.parse(fs.readFileSync(0, 'utf-8'));
const response = input.prompt_response;

if (!response.includes('Summary:')) {
  console.log(JSON.stringify({
    decision: "block",
    reason: "Your response is missing a Summary section. Please add one.",
    systemMessage: "Requesting missing summary..."
  }));
  process.exit(0);
}

console.log(JSON.stringify({ decision: "allow" }));
```

### Tool Filtering (BeforeToolSelection)

```javascript
#!/usr/bin/env node
const fs = require('fs');
const input = JSON.parse(fs.readFileSync(0, 'utf-8'));
const messages = input.llm_request.messages || [];
const lastUserMessage = messages.slice().reverse().find(m => m.role === 'user');

if (!lastUserMessage) {
  console.log(JSON.stringify({}));
  return;
}

const text = lastUserMessage.content;
const allowed = ['write_todos'];

if (text.includes('read') || text.includes('check')) {
  allowed.push('read_file', 'list_directory');
}
if (text.includes('test')) {
  allowed.push('run_shell_command');
}

if (allowed.length > 1) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "BeforeToolSelection",
      toolConfig: {
        mode: "ANY",
        allowedFunctionNames: allowed
      }
    }
  }));
} else {
  console.log(JSON.stringify({}));
}
```

## Hook Management CLI Commands

- `/hooks panel` -- View execution status and recent output
- `/hooks enable-all` -- Enable all hooks
- `/hooks disable-all` -- Disable all hooks
- `/hooks enable <name>` -- Toggle individual hook
- `/hooks disable <name>` -- Toggle individual hook

## Security Model

- Hooks execute with user privileges
- Project-level hooks are **fingerprinted**: if name or command changes (e.g.
  via `git pull`), treated as new untrusted hook with user warning
- Extension policies **cannot** use `allow` decisions or `yolo` mode
  (prevents extensions from bypassing security)

## Stable Model API (for Hooks)

```typescript
// LLMRequest
{
  "model": string,
  "messages": Array<{
    "role": "user" | "model" | "system",
    "content": string
  }>,
  "config": { "temperature": number, ... },
  "toolConfig": { "mode": string, "allowedFunctionNames": string[] }
}

// LLMResponse
{
  "candidates": Array<{
    "content": { "role": "model", "parts": string[] },
    "finishReason": string
  }>,
  "usageMetadata": { "totalTokenCount": number }
}
```

## Directory Structure

```
project/
  .gemini/
    settings.json          # Project-level settings + hooks config
    hooks/                 # Hook scripts
      security.sh
      filter-tools.js
      init.js
    policies/              # Policy TOML files
    skills/                # Agent skills
    sandbox-macos-custom.sb
    sandbox.Dockerfile
  GEMINI.md                # Project context (like CLAUDE.md)

~/.gemini/
  settings.json            # User-level settings + hooks config
  extensions/              # Installed extensions
  policies/                # User-level policies
  tmp/                     # Temporary session files
```

## Session Transcript Format (for Claude Office Integration)

### Storage Location

Sessions are stored as **append-only JSONL files** in:

```
~/.gemini/tmp/<project_hash>/chats/session-<timestamp>-<shortId>.jsonl
```

The `<project_hash>` is a **SHA-256 hex digest** of the project root absolute
path (computed by `getProjectHash()` in `packages/core/src/utils/paths.ts`).

### File Naming

- **Main sessions**: `session-2026-04-11T20-15-a1b2c3d4.jsonl`
  (timestamp truncated to minutes + first 8 chars of session UUID)
- **Subagent sessions**: `chats/<parentSessionId>/<subagentSessionId>.jsonl`
  (nested in a directory named after the parent session ID)
- **Legacy format**: `.json` extension (auto-migrated to `.jsonl` on resume)

### JSONL Record Types

Each line in the file is a JSON object. Four record types exist:

**1. Initial Metadata** (first line):
```json
{"sessionId":"uuid","projectHash":"sha256hex","startTime":"...","lastUpdated":"...","kind":"main"}
```

**2. Message Records**:
```json
{"id":"uuid","timestamp":"...","type":"user","content":"Hello"}
{"id":"uuid","timestamp":"...","type":"gemini","content":[{"text":"Hi"}],"model":"gemini-2.5-pro","tokens":{"input":10,"output":5,"cached":0,"total":15},"toolCalls":[...]}
```
- `type`: `"user"` | `"gemini"` | `"info"` | `"error"` | `"warning"`
- Gemini messages may include: `model`, `tokens`, `thoughts`, `toolCalls`

**3. Metadata Update Records**:
```json
{"$set":{"lastUpdated":"...","summary":"Auto-generated summary"}}
```

**4. Rewind Records**:
```json
{"$rewindTo":"message-uuid"}
```

### Data Captured

| Data | Captured |
|---|---|
| User prompts | Full text |
| Model responses | Full text |
| Tool calls | Name, args, results, status, timestamps |
| Token counts | Input, output, cached, thoughts, tool, total |
| Thoughts/reasoning | Subject and description |
| Model name | Yes (e.g., "gemini-2.5-pro") |
| Subagent sessions | Separate files in nested directory |

### ToolCallRecord Schema

```typescript
interface ToolCallRecord {
  id: string;                    // Tool call UUID
  name: string;                  // e.g., "read_file", "run_shell_command"
  args: Record<string, unknown>; // Tool arguments
  result?: PartListUnion | null; // Tool execution result
  status: string;                // Execution status
  timestamp: string;             // ISO 8601
  agentId?: string;              // Subagent ID
  displayName?: string;          // Human-readable name
  description?: string;
  renderOutputAsMarkdown?: boolean;
}
```

### Hook transcript_path

The `transcript_path` in hook input is populated by `createBaseInput()` in
`HookEventHandler`. It calls `getConversationFilePath()` on the
`ChatRecordingService` to get the absolute path to the current `.jsonl` file.

```typescript
// From hookEventHandler.ts
private createBaseInput(eventName: HookEventName): HookInput {
  const transcriptPath =
    this.context.geminiClient
      ?.getChatRecordingService()
      ?.getConversationFilePath() ?? '';
  return {
    session_id: this.context.config.getSessionId(),
    transcript_path: transcriptPath,
    cwd: this.context.config.getWorkingDir(),
    hook_event_name: eventName,
    timestamp: new Date().toISOString(),
  };
}
```

### Integration Strategy for Claude Office

1. Use a `SessionStart` hook to receive the `transcript_path`
2. Watch/poll that JSONL file for new lines (append-only, so seek to last position)
3. Parse each new line to extract conversation events
4. Handle all four record types (metadata, message, update, rewind)
5. Tool calls are in `toolCalls` array on `type: "gemini"` messages
6. Subagent sessions are in `chats/<parentSessionId>/` subdirectory

**Key difference from Claude Code**: The transcript path is only reliably
available through the hook system (not discoverable by convention alone),
since it requires knowing the project hash and session-specific filename.

### Comparison with Claude Code Transcripts

| Aspect | Claude Code | Gemini CLI |
|---|---|---|
| Format | JSONL | JSONL (was JSON) |
| Path | `~/.claude/projects/<hash>/` | `~/.gemini/tmp/<hash>/chats/` |
| Auto-save | Every message | Every message (append-only) |
| Subagent | Nested in main session | Separate files in subdirectory |
| Token tracking | Per-turn | Per-message with full breakdown |
| Rewind support | No | `$rewindTo` records |
| Summary | No | Auto-generated |

## Further Reading

- [Gemini CLI Hooks Documentation](https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/index.md) -- Official hooks overview
- [Hooks Reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md) -- Full I/O schema specification
- [Writing Hooks Guide](https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/writing-hooks.md) -- Tutorial with examples
- [Hooks Best Practices](https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/best-practices.md) -- Security, performance, debugging
- [Extensions Documentation](https://github.com/google-gemini/gemini-cli/blob/main/docs/extensions/index.md) -- Extension system
- [Google Developers Blog: Hooks](https://developers.googleblog.com/tailor-gemini-cli-to-your-workflow-with-hooks/) -- Announcement post
- [DeepWiki: Hooks System](https://deepwiki.com/google-gemini/gemini-cli/5.7-hooks-system) -- Internal architecture analysis
- [Session Management Docs](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/session-management.md) -- Session resume/list/delete
- [JSONL Migration Issue #15292](https://github.com/google-gemini/gemini-cli/issues/15292) -- Performance rationale for JSONL format
- [ChatRecordingService Source](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/services/chatRecordingService.ts) -- Core recording implementation
- [ChatRecordingTypes Source](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/services/chatRecordingTypes.ts) -- Type definitions
