/**
 * OpenCode plugin for Claude Office Visualizer.
 *
 * Intercepts OpenCode lifecycle events (session, tool, message, permission,
 * compaction, token usage) and POSTs them to the claude-office backend API,
 * enabling the same pixel-art office visualization that the Claude Code
 * hooks provide.
 *
 * The plugin uses only the hooks documented in @opencode-ai/plugin v1.2.18:
 *   - event            — global event stream (session.*, message.part.updated, etc.)
 *   - chat.message     — user submits a message
 *   - tool.execute.before — before a tool runs
 *   - tool.execute.after  — after a tool completes
 *   - permission.ask   — permission request
 *   - experimental.session.compacting — session compaction starts
 */

import { readFileSync } from "node:fs";
import type { Plugin, PluginInput, Hooks } from "@opencode-ai/plugin";
import type {
  Event,
  Session,
  Part,
  StepFinishPart,
  AssistantMessage,
  Permission,
} from "@opencode-ai/sdk";
import { SessionTracker } from "./sessionTracker";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_API_URL = "http://localhost:8000/api/v1/events";

/**
 * Read CLAUDE_OFFICE_API_URL from ~/.claude/claude-office-config.env, mirroring
 * the hooks' `_config_file_value` so both producers resolve the URL with
 * identical precedence (env var wins, then the config file, then the default).
 */
function config_file_api_url(): string | null {
  try {
    const home = process.env.HOME || process.env.USERPROFILE || "";
    const lines = readFileSync(`${home}/.claude/claude-office-config.env`, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const eq = trimmed.indexOf("=");
      if (trimmed.slice(0, eq).trim() !== "CLAUDE_OFFICE_API_URL") continue;
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (value) return value;
    }
  } catch {
    // Missing/unreadable config file is the normal case.
  }
  return null;
}

/**
 * Resolve the backend event endpoint, applying the loopback clamp (ARC-020).
 * Mirrors hooks/src/claude_office_hooks/config.py:_resolve_api_url so both
 * producers treat CLAUDE_OFFICE_API_URL identically: a non-localhost URL is
 * reset to the local default unless CLAUDE_OFFICE_ALLOW_REMOTE=1. Event
 * payloads carry tool inputs/outputs and file paths, so this guards against
 * accidental exfiltration to an attacker-controlled URL. Exported for tests.
 */
export function resolveApiUrl(
  rawUrl: string,
  allowRemote: boolean,
  onClamp: (host: string) => void,
): string {
  let host: string;
  try {
    host = new URL(rawUrl).hostname;
  } catch {
    // Malformed URL — surface as a fetch failure rather than silently
    // redirecting. Treat as local (matches hooks' None-hostname handling).
    return rawUrl;
  }
  // Node includes brackets on IPv6 literals ("[::1]"); Python's urlparse does
  // not. Strip them so the loopback check matches the hooks.
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  const isLocalhost =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "";
  if (isLocalhost) return rawUrl;
  if (allowRemote) return rawUrl;
  onClamp(host);
  return DEFAULT_API_URL;
}

const API_URL = resolveApiUrl(
  process.env.CLAUDE_OFFICE_API_URL ?? config_file_api_url() ?? DEFAULT_API_URL,
  process.env.CLAUDE_OFFICE_ALLOW_REMOTE === "1",
  (host) => {
    // Read the env directly: the DEBUG const below is initialized AFTER this
    // line, so referencing it here would hit the temporal dead zone.
    if (process.env.CLAUDE_OFFICE_DEBUG === "1") {
      console.error(
        `[claude-office] CLAUDE_OFFICE_API_URL is non-localhost ('${host}'); ` +
          "clamped to local default. Set CLAUDE_OFFICE_ALLOW_REMOTE=1 to allow a remote backend.",
      );
    }
  },
);

/** HTTP timeout in milliseconds — keep short so hooks never block OpenCode. */
const TIMEOUT_MS = Number(process.env.CLAUDE_OFFICE_TIMEOUT_MS ?? "1500");

/** Enable debug logging to stderr (never stdout — that would interfere). */
const DEBUG = process.env.CLAUDE_OFFICE_DEBUG === "1";

/**
 * Optional API key. When non-empty, every event POST is sent with
 * `X-API-Key: <key>` so the backend's `ApiKeyMiddleware` accepts it
 * (SEC-005). Empty by default — deployments that don't set an explicit
 * backend key keep sending events exactly as before, with no header.
 */
const API_KEY = process.env.CLAUDE_OFFICE_API_KEY ?? "";

// ---------------------------------------------------------------------------
// Types — mirrors the backend Event model
// ---------------------------------------------------------------------------

type EventType =
  | "session_start"
  | "session_end"
  | "pre_tool_use"
  | "post_tool_use"
  | "user_prompt_submit"
  | "permission_request"
  | "notification"
  | "subagent_start"
  | "subagent_info"
  | "subagent_stop"
  | "agent_update"
  | "stop"
  | "cleanup"
  | "context_compaction"
  | "reporting"
  | "walking_to_desk"
  | "waiting"
  | "leaving"
  | "error"
  | "background_task_notification";

interface EventData {
  source?: string;
  project_name?: string;
  project_dir?: string;
  working_dir?: string;
  tool_name?: string;
  tool_use_id?: string;
  tool_input?: Record<string, unknown>;
  success?: boolean;
  agent_id?: string;
  native_agent_id?: string;
  agent_name?: string;
  agent_type?: string;
  task_description?: string;
  result_summary?: string;
  notification_type?: string;
  message?: string;
  error_type?: string;
  reason?: string;
  summary?: string;
  prompt?: string;
  thinking?: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_creation_tokens?: number;
  task_list_id?: string;
}

export interface BackendEvent {
  event_type: EventType;
  session_id: string;
  timestamp: string;
  data: EventData;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function debug(...args: unknown[]): void {
  if (DEBUG) {
    console.error("[claude-office]", ...args);
  }
}

/**
 * Check if a tool name represents a subagent/task tool.
 * OpenCode uses lowercase names (task, agent) while Claude Code uses
 * capitalized names (Task, Agent). Match both.
 */
function isSubagentTool(toolName: string): boolean {
  const lower = toolName.toLowerCase();
  return lower === "task" || lower === "agent";
}

function isoNow(): string {
  return new Date().toISOString();
}

/**
 * Derive a short project name from a directory path.
 * Takes the last path component (e.g. "/Users/me/Repos/myapp" -> "myapp").
 */
function projectNameFromDir(dir: string): string {
  if (!dir) return "unknown";
  const parts = dir.replace(/\/$/, "").split("/");
  return parts[parts.length - 1] || "unknown";
}

/**
 * Truncate a string to `max` characters, appending "..." if truncated.
 */
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}

/**
 * Build the request headers for an event POST. Attaches `X-API-Key` only
 * when a non-empty API key is configured, so the default (no
 * `CLAUDE_OFFICE_API_KEY`) sends exactly the pre-SEC-005 headers.
 *
 * Exported (and kept pure) so tests can pin the with-key / without-key
 * behavior without touching the real fetch path.
 */
export function buildEventHeaders(apiKey: string = API_KEY): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["X-API-Key"] = apiKey;
  return headers;
}

/**
 * Fire-and-forget POST to the claude-office backend.
 * Never throws — errors are swallowed (logged in DEBUG mode).
 */
async function sendEvent(event: BackendEvent): Promise<void> {
  debug("->", event.event_type, event.session_id);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const resp = await fetch(API_URL, {
      method: "POST",
      headers: buildEventHeaders(),
      body: JSON.stringify(event),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!resp.ok) {
      debug("Backend responded", resp.status);
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      debug("Request timed out");
    } else {
      debug("Request failed:", err);
    }
  }
}

// ---------------------------------------------------------------------------
// State tracking
// ---------------------------------------------------------------------------

/**
 * Session-tracking state moved into an injectable, unit-tested class.
 *
 * The 7 Map/Set structures that used to live at module scope (activeSessions,
 * childToParent, childToAgent, pendingTaskCalls, childSessionToCallId,
 * childSessionToParent, childStopped) plus the order-dependent session-linking
 * heuristics now live on `SessionTracker`. The transport is constructor-
 * injected so tests can characterize the heuristics without the real fetch
 * path; see `tests/sessionTracker.test.ts`.
 *
 * The instance is kept at module scope (matching the prior lifetime of the
 * 7 structures): it must survive across plugin factory invocations so that
 * pending-callID FIFOs and child-session linkage persist for the process
 * lifetime.
 */
const tracker = new SessionTracker(sendEvent);

// ---------------------------------------------------------------------------
// Plugin entry point
// ---------------------------------------------------------------------------

const plugin: Plugin = async (ctx: PluginInput): Promise<Hooks> => {
  const projectName = projectNameFromDir(ctx.directory);
  const projectDir = ctx.directory;
  const worktree = ctx.worktree;

  debug("Plugin loaded for project:", projectName, "dir:", projectDir);

  /**
   * Build the common base data payload included in every event. `source`
   * tells the backend these are plugin events: their child @agent sessions
   * start without a session_start BY DESIGN and must stay excluded from the
   * backend's session-start recovery (they would otherwise surface in the
   * sidebar).
   */
  function baseData(): EventData {
    return {
      source: "opencode",
      project_name: projectName,
      project_dir: projectDir,
      working_dir: worktree,
    };
  }

  /**
   * Build a full BackendEvent ready to POST.
   */
  function makeEvent(
    eventType: EventType,
    sessionId: string,
    extra?: Partial<EventData>
  ): BackendEvent {
    return {
      event_type: eventType,
      session_id: sessionId || "unknown_session",
      timestamp: isoNow(),
      data: { ...baseData(), ...extra },
    };
  }

  // -------------------------------------------------------------------------
  // Part update handler (used by the event hook below)
  // -------------------------------------------------------------------------

  async function handlePartUpdate(part: Part): Promise<void> {
    switch (part.type) {
      // NOTE: "tool" parts are intentionally NOT handled here.
      // tool.execute.before/after hooks are the sole source of pre_tool_use /
      // post_tool_use / subagent_start / subagent_stop events. Handling them
      // here too would send duplicates for every tool call.

      // --- Subtask parts -> subagent_start ---
      case "subtask": {
        const subtask = part as {
          id: string;
          sessionID: string;
          messageID: string;
          type: "subtask";
          prompt: string;
          description: string;
          agent: string;
        };
        await sendEvent(
          makeEvent("subagent_start", subtask.sessionID, {
            agent_id: `subagent_${subtask.id}`,
            agent_name: subtask.description || subtask.agent,
            agent_type: subtask.agent,
            task_description: subtask.prompt,
          })
        );
        break;
      }

      // --- Compaction parts ---
      case "compaction": {
        await sendEvent(
          makeEvent("context_compaction", part.sessionID, {
            summary: "Context compaction in progress",
          })
        );
        break;
      }

      // --- Step finish -> token usage reporting ---
      case "step-finish": {
        const step = part as StepFinishPart;
        if (step.tokens) {
          await sendEvent(
            makeEvent("reporting", step.sessionID, {
              input_tokens: step.tokens.input,
              output_tokens: step.tokens.output,
              cache_read_tokens: step.tokens.cache.read,
              cache_creation_tokens: step.tokens.cache.write,
              summary: `Step done: ${step.tokens.input}in/${step.tokens.output}out ($${step.cost.toFixed(4)})`,
            })
          );
        }
        break;
      }

      default:
        // text, reasoning, file, snapshot, patch, agent, retry — no action needed
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Hook implementations
  // -------------------------------------------------------------------------

  return {
    // -----------------------------------------------------------------------
    // Global event stream — handles session lifecycle, tool state transitions,
    // step-finish (token usage), compaction parts, and subtask parts.
    // -----------------------------------------------------------------------
    async event({ event }: { event: Event }) {
      switch (event.type) {
        // --- Session lifecycle ---

        case "session.created": {
          const session = event.properties.info as Session;
          if (!tracker.isSessionActive(session.id)) {
            tracker.markSessionActive(session.id);
            const parentID = (session as unknown as { parentID?: string }).parentID;
            if (parentID) {
              // Child session — check if it was spawned by a task tool call.
              // Task tool calls register pending callIDs before their child
              // session appears; linkChildSession FIFO-shifts the oldest.
              const linked = tracker.linkChildSession(session.id, parentID);
              if (linked) {
                // Suppress duplicate subagent_start — tool.execute.before already fired it.
                debug("Child session", session.id, "linked to task callID", linked.callID, "- suppressing duplicate start");
              } else {
                // No pending task call — this is a true @mention subagent session.
                const agentName = (session as unknown as { agent?: string }).agent ?? "subagent";
                tracker.registerMentionChild(session.id, parentID, agentName);
                await sendEvent(
                  makeEvent("subagent_start", parentID, {
                    agent_id: `subagent_${session.id}`,
                    native_agent_id: session.id,
                    agent_name: agentName,
                    agent_type: agentName,
                    summary: `@${agentName} subagent started`,
                  })
                );
              }
            } else {
              await sendEvent(
                makeEvent("session_start", session.id, {
                  summary: `Session started (opencode)`,
                })
              );
            }
          }
          break;
        }

        case "session.deleted": {
          const session = event.properties.info as Session;
          tracker.clearActiveSession(session.id);

          if (tracker.isTaskToolChild(session.id)) {
            // Task-tool-spawned child — tool.execute.after already handles subagent_stop.
            // Just clean up our tracking maps.
            tracker.clearTaskToolChildMaps(session.id);
            tracker.clearChildStopped(session.id);
            debug("Child session", session.id, "deleted (task-tool-spawned) — stop handled by tool.execute.after");
          } else {
            const parentID = tracker.getMentionChildParent(session.id);
            if (parentID) {
              // @mention child session deleted — clean up tracking maps.
              const agentName = tracker.getMentionChildAgent(session.id) ?? "subagent";
              tracker.clearMentionChildMaps(session.id);
              // Only emit subagent_stop if we haven't already (session.idle fires first usually)
              if (tracker.markChildStopped(session.id)) {
                await sendEvent(
                  makeEvent("subagent_stop", parentID, {
                    agent_id: `subagent_${session.id}`,
                    native_agent_id: session.id,
                    agent_name: agentName,
                    success: true,
                    reason: "deleted",
                  })
                );
              }
              // session.deleted is terminal for this child — drop its marker so
              // the childStopped Set doesn't grow unbounded over the process
              // lifetime (the marker only needs to survive the idle→deleted gap).
              tracker.clearChildStopped(session.id);
            } else {
              await sendEvent(
                makeEvent("session_end", session.id, {
                  reason: "deleted",
                })
              );
            }
          }
          break;
        }

        case "session.idle": {
          const { sessionID } = event.properties;

          if (tracker.isTaskToolChild(sessionID)) {
            // Task-tool-spawned child went idle — tool.execute.after handles it.
            debug("Child session", sessionID, "idle (task-tool-spawned) — stop handled by tool.execute.after");
          } else {
            const parentID = tracker.getMentionChildParent(sessionID);
            if (parentID) {
              // @mention child session went idle — emit subagent_stop on parent.
              const agentName = tracker.getMentionChildAgent(sessionID) ?? "subagent";
              if (tracker.markChildStopped(sessionID)) {
                await sendEvent(
                  makeEvent("subagent_stop", parentID, {
                    agent_id: `subagent_${sessionID}`,
                    native_agent_id: sessionID,
                    agent_name: agentName,
                    success: true,
                    summary: `@${agentName} subagent finished`,
                  })
                );
              }
            } else {
              // session.idle fires when the agent finishes processing.
              // Map to "stop" to trigger the "done working" animation.
              await sendEvent(
                makeEvent("stop", sessionID, {
                  summary: "Agent idle",
                })
              );
            }
          }
          break;
        }

        case "session.updated": {
          // OpenCode sets the session title as the agent processes. Use this
          // to update the agent name map for @mention child sessions so the
          // visualizer shows the real name instead of "subagent".
          const updatedSession = event.properties.info as Session;
          const title = updatedSession.title?.trim();
          if (!title) break;

          if (tracker.isTaskToolChild(updatedSession.id)) {
            // Task-tool-spawned child — update agent name via agent_update event
            // targeted at the parent session, keyed by callID.
            const parentID = tracker.getTaskToolChildParent(updatedSession.id);
            const callId = tracker.getTaskToolChildCallId(updatedSession.id) as string;
            if (parentID && title) {
              debug("Updating task-agent name:", callId, "->", title);
              await sendEvent(
                makeEvent("agent_update", parentID, {
                  agent_id: `subagent_${callId}`,
                  agent_name: title,
                  summary: `Agent renamed: ${title}`,
                })
              );
            }
          } else if (tracker.hasMentionChild(updatedSession.id)) {
            // @mention child session — update agent name map
            if (title !== tracker.getMentionChildAgent(updatedSession.id)) {
              tracker.setMentionChildAgent(updatedSession.id, title);
              debug("Updated @mention agent name from session.updated:", title);
            }
          }
          break;
        }

        case "session.compacted": {
          const { sessionID: compactedSessionID } = event.properties;
          await sendEvent(
            makeEvent("context_compaction", compactedSessionID, {
              summary: "Context window compacted",
            })
          );
          break;
        }

        case "session.error": {
          const sessionID = event.properties.sessionID;
          const error = event.properties.error;
          if (sessionID) {
            await sendEvent(
              makeEvent("error", sessionID, {
                error_type: error?.name,
                message: "data" in (error ?? {}) ? (error as { data: { message?: string } }).data?.message : undefined,
                summary: `Error: ${error?.name ?? "unknown"}`,
              })
            );
          }
          break;
        }

        // --- Message part updates (tool transitions, subtasks, compaction, tokens) ---

        case "message.part.updated": {
          const part = event.properties.part as Part;
          await handlePartUpdate(part);
          break;
        }

        // --- Message updates (token tracking from completed assistant messages) ---

        case "message.updated": {
          const msg = event.properties.info;
          if (msg.role === "assistant") {
            const assistant = msg as AssistantMessage;
            // Only report tokens for completed messages (has finish reason)
            if (assistant.finish && assistant.tokens) {
              await sendEvent(
                makeEvent("reporting", assistant.sessionID, {
                  input_tokens: assistant.tokens.input,
                  output_tokens: assistant.tokens.output,
                  cache_read_tokens: assistant.tokens.cache.read,
                  cache_creation_tokens: assistant.tokens.cache.write,
                  summary: `Tokens: ${assistant.tokens.input}in/${assistant.tokens.output}out`,
                })
              );
            }
          }
          break;
        }

        default:
          // Ignore events we don't care about (lsp, file watcher, vcs, etc.)
          break;
      }
    },

    // -----------------------------------------------------------------------
    // chat.message — fires when the user submits a prompt
    // -----------------------------------------------------------------------
    async "chat.message"(input, output) {
      const sessionID = input.sessionID;
      const prompt = output.message?.id
        ? truncate(
            output.parts
              ?.filter((p) => p.type === "text")
              .map((p) => (p as { text: string }).text)
              .join(" ") || "",
            50
          )
        : "";

      await sendEvent(
        makeEvent("user_prompt_submit", sessionID, {
          prompt,
          summary: prompt ? `User: ${prompt}` : "User submitted prompt",
        })
      );
    },

    // -----------------------------------------------------------------------
    // tool.execute.before — fires before a tool runs
    // -----------------------------------------------------------------------
    async "tool.execute.before"(input, output) {
      const { tool, sessionID, callID } = input;

      // For Task/Agent tools, emit subagent_start instead
      if (isSubagentTool(tool)) {
        // Register this callID as a pending task tool call on this session.
        // When session.created fires for the child session, it will find this
        // and link the child session to this callID instead of emitting a
        // duplicate subagent_start.
        tracker.registerTaskCall(sessionID, callID);

        await sendEvent(
          makeEvent("subagent_start", sessionID, {
            agent_id: `subagent_${callID}`,
            tool_name: tool,
            tool_use_id: callID,
            task_description:
              typeof output.args === "object" && output.args
                ? (output.args as Record<string, unknown>).prompt as string ??
                  (output.args as Record<string, unknown>).description as string ??
                  ""
                : "",
            agent_name:
              typeof output.args === "object" && output.args
                ? (output.args as Record<string, unknown>).description as string ?? tool
                : tool,
            agent_type:
              typeof output.args === "object" && output.args
                ? (output.args as Record<string, unknown>).subagent_type as string ?? ""
                : "",
          })
        );
      } else {
        await sendEvent(
          makeEvent("pre_tool_use", sessionID, {
            tool_name: tool,
            tool_use_id: callID,
            tool_input:
              typeof output.args === "object" && output.args
                ? (output.args as Record<string, unknown>)
                : undefined,
            agent_id: "main",
          })
        );
      }
    },

    // -----------------------------------------------------------------------
    // tool.execute.after — fires after a tool completes
    // -----------------------------------------------------------------------
    async "tool.execute.after"(input, output) {
      const { tool, sessionID, callID } = input;

      if (isSubagentTool(tool)) {
        // Clean up pendingTaskCalls in case child session never appeared (error case)
        tracker.removePendingTaskCall(sessionID, callID);
        await sendEvent(
          makeEvent("subagent_stop", sessionID, {
            agent_id: `subagent_${callID}`,
            tool_name: tool,
            tool_use_id: callID,
            success: true,
            result_summary: truncate(output.output || "", 200),
          })
        );
      } else {
        await sendEvent(
          makeEvent("post_tool_use", sessionID, {
            tool_name: tool,
            tool_use_id: callID,
            success: true,
            agent_id: "main",
            summary: output.title || `${tool} completed`,
          })
        );
      }
    },

    // -----------------------------------------------------------------------
    // permission.ask — fires when OpenCode requests user permission
    // -----------------------------------------------------------------------
    async "permission.ask"(input: Permission, _output) {
      await sendEvent(
        makeEvent("permission_request", input.sessionID, {
          tool_name: input.type,
          tool_use_id: input.callID,
          agent_id: "main",
          summary: input.title,
        })
      );
    },

    // -----------------------------------------------------------------------
    // experimental.session.compacting — fires when compaction begins
    // -----------------------------------------------------------------------
    async "experimental.session.compacting"(input, _output) {
      await sendEvent(
        makeEvent("context_compaction", input.sessionID, {
          summary: "Context window compacting",
        })
      );
    },
  };
};

/** Named export for local plugin loading (`.opencode/plugins/` convention). */
export const ClaudeOfficePlugin = plugin;

export default plugin;
