# Claude Code JSONL Format Research

This document captures findings about Claude Code's JSONL transcript format.

## File Locations

- Main session transcripts: `~/.claude/projects/<PROJECT_NAME>/<session_id>.jsonl`
- Subagent transcripts: `~/.claude/projects/<PROJECT_NAME>/agent-<agent_id>.jsonl`

## JSONL Structure

Each line is a JSON object representing a snapshot update:

```json
{
  "type": "snapshot_update",
  "messageId": "msg_xxx",
  "isSnapshotUpdate": true,
  "snapshot": {
    "messages": [...]
  }
}
```

## Message Types

### User Messages
```json
{
  "role": "user",
  "content": [
    {"type": "text", "text": "user input here"}
  ]
}
```

### Assistant Messages
```json
{
  "role": "assistant",
  "content": [
    {"type": "thinking", "thinking": "Claude's internal reasoning..."},
    {"type": "text", "text": "response to user"},
    {"type": "tool_use", "id": "toolu_xxx", "name": "Read", "input": {...}}
  ]
}
```

## Thinking Blocks

When extended thinking is enabled, assistant messages include thinking blocks:

```json
{"type": "thinking", "thinking": "Let me analyze this problem..."}
```

**Key observations:**
- Thinking blocks appear before text/tool_use blocks in content array
- Content is escaped JSON (quotes as `\"`, newlines as `\n`)
- Multiple thinking blocks may appear in a single message
- Thinking is interleaved with tool calls

## Tool Use Blocks

```json
{
  "type": "tool_use",
  "id": "toolu_01ABC123",
  "name": "Read",
  "input": {
    "file_path": "/path/to/file.py"
  }
}
```

## Useful jq Queries

```bash
# Get all thinking content from a file
jq -r '.snapshot.messages[] | select(.role=="assistant") | .content[] | select(.type=="thinking") | .thinking' file.jsonl

# Count messages by role
jq -r '.snapshot.messages[].role' file.jsonl | sort | uniq -c

# List all tool names used
jq -r '.snapshot.messages[] | .content[]? | select(.type=="tool_use") | .name' file.jsonl | sort | uniq -c

# Get file sizes of all project transcripts
find ~/.claude/projects -name "*.jsonl" -exec ls -lh {} \;
```

## Performance Notes

- JSONL files can grow to 10MB+ for long sessions
- Use `tail -c 50000` to read recent content efficiently
- Each line is independent - can process line by line
- grep is faster than jq for simple pattern matching

## Related Files

- Hooks implementation: `hooks/src/claude_office_hooks/main.py`
- Thinking extraction: `extract_latest_thinking()` function
