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

import type { Plugin, PluginInput, Hooks } from "@opencode-ai/plugin";
import type {
  Event,
  Session,
  Part,
  ToolPart,
  StepFinishPart,
  AssistantMessage,
  Permission,
} from "@opencode-ai/sdk";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_URL =
  process.env.CLAUDE_OFFICE_API_URL ?? "http://localhost:8000/api/v1/events";

/** HTTP timeout in milliseconds — keep short so hooks never block OpenCode. */
const TIMEOUT_MS = Number(process.env.CLAUDE_OFFICE_TIMEOUT_MS ?? "1500");

/** Enable debug logging to stderr (never stdout — that would interfere). */
const DEBUG = process.env.CLAUDE_OFFICE_DEBUG === "1";

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

interface BackendEvent {
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!resp.ok) {
      debug("Backend responded", resp.status, await resp.text());
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
 * Track which sessions we've already sent session_start for, to avoid
 * duplicate start events (OpenCode fires session.created for every session
 * at startup, including old ones).
 */
const activeSessions = new Set<string>();

/**
 * Track tool parts we've already sent pre_tool_use for (by callID),
 * so we only send each transition once.
 */
const toolsSentPre = new Set<string>();
const toolsSentPost = new Set<string>();

// ---------------------------------------------------------------------------
// Plugin entry point
// ---------------------------------------------------------------------------

const plugin: Plugin = async (ctx: PluginInput): Promise<Hooks> => {
  const projectName = projectNameFromDir(ctx.directory);
  const projectDir = ctx.directory;
  const worktree = ctx.worktree;

  debug("Plugin loaded for project:", projectName, "dir:", projectDir);

  /**
   * Build the common base data payload included in every event.
   */
  function baseData(): EventData {
    return {
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
      // --- Tool state machine transitions ---
      case "tool": {
        const toolPart = part as ToolPart;
        const key = `${toolPart.sessionID}:${toolPart.callID}`;

        if (
          toolPart.state.status === "running" &&
          !toolsSentPre.has(key)
        ) {
          toolsSentPre.add(key);
          // Emit pre_tool_use or subagent_start based on tool name
          if (toolPart.tool === "Task" || toolPart.tool === "Agent") {
            const input = toolPart.state.input || {};
            await sendEvent(
              makeEvent("subagent_start", toolPart.sessionID, {
                agent_id: `subagent_${toolPart.callID}`,
                tool_name: toolPart.tool,
                tool_use_id: toolPart.callID,
                task_description: (input.prompt as string) ?? (input.description as string) ?? "",
                agent_name: (input.description as string) ?? toolPart.tool,
                agent_type: (input.subagent_type as string) ?? "",
              })
            );
          } else {
            await sendEvent(
              makeEvent("pre_tool_use", toolPart.sessionID, {
                tool_name: toolPart.tool,
                tool_use_id: toolPart.callID,
                tool_input: toolPart.state.input as Record<string, unknown>,
                agent_id: "main",
              })
            );
          }
        }

        if (
          (toolPart.state.status === "completed" ||
            toolPart.state.status === "error") &&
          !toolsSentPost.has(key)
        ) {
          toolsSentPost.add(key);
          const success = toolPart.state.status === "completed";

          if (toolPart.tool === "Task" || toolPart.tool === "Agent") {
            await sendEvent(
              makeEvent("subagent_stop", toolPart.sessionID, {
                agent_id: `subagent_${toolPart.callID}`,
                tool_name: toolPart.tool,
                tool_use_id: toolPart.callID,
                success,
                result_summary: success
                  ? truncate((toolPart.state as { output?: string }).output ?? "", 200)
                  : (toolPart.state as { error?: string }).error ?? "Error",
              })
            );
          } else {
            await sendEvent(
              makeEvent("post_tool_use", toolPart.sessionID, {
                tool_name: toolPart.tool,
                tool_use_id: toolPart.callID,
                success,
                agent_id: "main",
                summary: success
                  ? (toolPart.state as { title?: string }).title ?? `${toolPart.tool} completed`
                  : `${toolPart.tool} failed`,
              })
            );
          }

          // Garbage-collect tracking sets to prevent unbounded growth
          // (safe because a tool won't transition again after completion)
          setTimeout(() => {
            toolsSentPre.delete(key);
            toolsSentPost.delete(key);
          }, 60_000);
        }
        break;
      }

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
          if (!activeSessions.has(session.id)) {
            activeSessions.add(session.id);
            await sendEvent(
              makeEvent("session_start", session.id, {
                summary: `Session started (opencode)`,
              })
            );
          }
          break;
        }

        case "session.deleted": {
          const session = event.properties.info as Session;
          activeSessions.delete(session.id);
          await sendEvent(
            makeEvent("session_end", session.id, {
              reason: "deleted",
            })
          );
          break;
        }

        case "session.idle": {
          const { sessionID } = event.properties;
          // session.idle fires when the agent finishes processing.
          // Map to "stop" to trigger the "done working" animation.
          await sendEvent(
            makeEvent("stop", sessionID, {
              summary: "Agent idle",
            })
          );
          break;
        }

        case "session.compacted": {
          const { sessionID } = event.properties;
          await sendEvent(
            makeEvent("context_compaction", sessionID, {
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
      if (tool === "Task" || tool === "Agent") {
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

      if (tool === "Task" || tool === "Agent") {
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
