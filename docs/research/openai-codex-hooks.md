# OpenAI Codex CLI Hooks System Research

> Research date: 2026-04-11
> Codex CLI version studied: v0.120.0 (latest as of research date)
> Source: Vault note at `~/ClaudeVault/Tools/openai-codex-hooks.md`

## Executive Summary

OpenAI Codex CLI has an **experimental** hooks system (feature-flagged off by default) with 5 event types and only `command` handler support. It is significantly less mature than Claude Code's hooks system (which has 20+ events and 4 handler types). The biggest gap for multi-agent orchestration: Codex does not fire hooks for file writes via `apply_patch`, has no subagent lifecycle events, and only intercepts `Bash` tool calls.

## What This Means for Claude Office

For the Claude Office visualizer, which currently captures Claude Code hooks events:

1. **No direct Codex CLI integration possible yet** -- Codex hooks cannot capture file edits, agent spawns, or most tool operations.
2. **Bash-only interception** limits what visual events we could extract from Codex.
3. **No subagent events** means we cannot visualize Codex's agent spawning behavior.
4. **The wire protocol is similar** (JSON on stdin, JSON on stdout, exit code semantics) so a future adapter would be straightforward once Codex expands coverage.

## Key Facts

### Enabling Hooks

```toml
# ~/.codex/config.toml
[features]
codex_hooks = true
```

### Configuration Files

- `~/.codex/hooks.json` (user-global)
- `<repo>/.codex/hooks.json` (project-local)
- All files merge additively (no override)

### Supported Events (5)

| Event | Matcher | Current Scope |
|-------|---------|---------------|
| `SessionStart` | `startup\|resume\|clear` | Session lifecycle |
| `PreToolUse` | `Bash` only | Before Bash execution |
| `PostToolUse` | `Bash` only | After Bash execution |
| `UserPromptSubmit` | none | Before prompt sent to model |
| `Stop` | none | When a turn ends |

### Common Input Fields (all events)

```
session_id, transcript_path, cwd, hook_event_name, model, permission_mode
```

Turn-scoped events also include: `turn_id`

### Critical Gaps vs Claude Code

- No file write hooks (apply_patch not intercepted -- Issue #16732)
- No agent/subagent events
- No notification, compaction, config change, or session end events
- Only `command` handler type (no `http`, `prompt`, `agent`)
- Experimental and behind feature flag

### Full Schema Reference

JSON schemas at: `github.com/openai/codex/tree/main/codex-rs/hooks/schema/generated/`

## Sources

- [Official Hooks Docs](https://developers.openai.com/codex/hooks)
- [Config Reference](https://developers.openai.com/codex/config-reference)
- [GitHub: openai/codex](https://github.com/openai/codex)
- [Issue #16732: apply_patch hooks gap](https://github.com/openai/codex/issues/16732)
- [Issue #14754: PreToolUse/PostToolUse request](https://github.com/openai/codex/issues/14754)
