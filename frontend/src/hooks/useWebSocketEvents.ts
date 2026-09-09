/**
 * WebSocket Event Handler (thin lifecycle binding).
 *
 * Wires the {@link WebSocketController} (transport: connect/reconnect/backoff)
 * to React and dispatches incoming messages to the appropriate domain module:
 *   - `state_update` → {@link reconcileState} (agent diff, spawn policy, office sync)
 *   - `pre/post_tool_use` → {@link TypingTracker} (min-duration typing timer)
 *   - `event` / `git_status` / `reload` / `session_deleted` / `error` → handled inline
 *
 * All heavy logic has been extracted so this file is just plumbing: refs that
 * persist across renders, a controller instance, and a `useEffect` that opens
 * and tears down the connection. See ARC-018.
 */

"use client";

import { WS_BASE } from "@/utils/api";
import { useCallback, useEffect, useRef } from "react";
import { useGameStore } from "@/stores/gameStore";
import { useAttentionStore } from "@/stores/attentionStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { agentMachineService } from "@/machines/agentMachineService";
import { resetSpawnIndex } from "@/systems/queuePositions";
import { TypingTracker } from "@/systems/typingTracker";
import { reconcileState } from "@/systems/stateReconciler";
import { shouldShowToast } from "@/systems/toastFilter";
import { WebSocketController } from "@/systems/webSocketController";
import type { EventType, WebSocketMessage } from "@/types";

// ============================================================================
// TYPES
// ============================================================================

interface UseWebSocketEventsOptions {
  sessionId: string;
  enabled?: boolean;
}

// ============================================================================
// HOOK
// ============================================================================

export function useWebSocketEvents({
  sessionId,
  enabled = true,
}: UseWebSocketEventsOptions): void {
  // ---- Domain-tracking refs (read/written by reconcileState) ----
  const processedAgentsRef = useRef<Set<string>>(new Set());
  const currentSessionIdRef = useRef(sessionId);
  currentSessionIdRef.current = sessionId;
  // Prevents backend queue state from overwriting the frontend's animated queue
  // after the initial mid-session-join sync.
  const initialQueueSyncDoneRef = useRef<string | null>(null);
  // Per-entity last bubble text — suppresses re-enqueue after display clear.
  const lastSeenBubbleTextRef = useRef<Map<string, string>>(new Map());

  // ---- Typing tracker (min-duration state machine, extracted) ----
  // Created once; setTyping routes "boss"/"main" → boss store, else agent store.
  const typingTrackerRef = useRef<TypingTracker | null>(null);
  if (typingTrackerRef.current === null) {
    typingTrackerRef.current = new TypingTracker((key, typing) => {
      if (key === "boss" || key === "main") {
        useGameStore.getState().setBossTyping(typing);
      } else {
        useGameStore.getState().setAgentTyping(key, typing);
      }
    });
  }

  // ---- Store actions (stable zustand references) ----
  const setConnected = useGameStore.getState().setConnected;
  const setSessionId = useGameStore.getState().setSessionId;
  const setGitStatus = useGameStore.getState().setGitStatus;
  const addEventLog = useGameStore.getState().addEventLog;

  // ---- Reconnect bookkeeping (clears stale tracking state on a fresh socket) ----
  const handleReconnectReset = useCallback(() => {
    processedAgentsRef.current.clear();
    lastSeenBubbleTextRef.current.clear();
    resetSpawnIndex();
  }, []);

  // ---- Message dispatch ----
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);

        // Validate session id for messages that include it
        // (session_deleted and reload are global).
        if (
          message.type !== "session_deleted" &&
          message.type !== "reload" &&
          message.state?.sessionId &&
          message.state.sessionId !== currentSessionIdRef.current
        ) {
          return;
        }

        switch (message.type) {
          case "state_update":
            if (message.state) {
              reconcileState(message.state, {
                currentSessionId: currentSessionIdRef.current,
                processedAgents: processedAgentsRef.current,
                lastSeenBubbleText: lastSeenBubbleTextRef.current,
                initialQueueSyncDone: initialQueueSyncDoneRef,
              });
            }
            break;

          case "event":
            if (message.event) {
              addEventLog(message.event);

              // Clear processed agents on session_start to allow re-detection.
              // Needed when simulation re-runs with the same session id and agent ids.
              if (message.event.type === "session_start") {
                processedAgentsRef.current.clear();
                lastSeenBubbleTextRef.current.clear();
                resetSpawnIndex();
              }

              // Toggle typing animation on tool-use events (min-duration enforced
              // by TypingTracker).
              if (
                message.event.type === "pre_tool_use" ||
                message.event.type === "post_tool_use"
              ) {
                const agentId = message.event.agentId;
                const typingKey = agentId || "boss";
                if (message.event.type === "pre_tool_use") {
                  typingTrackerRef.current?.onPreToolUse(typingKey);
                } else {
                  typingTrackerRef.current?.onPostToolUse(typingKey);
                }
              }

              // Trigger compaction animation on context_compaction event.
              if (message.event.type === "context_compaction") {
                useGameStore.getState().triggerCompaction();
              }

              // Attention toasts — wire event processing into attention store.
              // `shouldShowToast` (pure) owns the type + preference gate.
              if (
                shouldShowToast(
                  message.event.type as EventType,
                  usePreferencesStore.getState(),
                )
              ) {
                useAttentionStore.getState().processEvent({
                  type: message.event.type as EventType,
                  agentId: message.event.agentId ?? null,
                  agentName: message.event.detail?.agentName ?? null,
                  taskDescription:
                    message.event.detail?.taskDescription ?? null,
                  errorType: message.event.detail?.errorType ?? null,
                  message: message.event.detail?.message ?? null,
                });
              }
            }
            break;

          case "git_status":
            if (message.gitStatus) {
              setGitStatus(message.gitStatus);
            }
            break;

          case "reload":
            window.location.reload();
            break;

          case "session_deleted":
            // Session was deleted (possibly by another client).
            // Emit custom event for session list components to refetch.
            window.dispatchEvent(
              new CustomEvent("session-deleted", {
                detail: { sessionId: message.session_id },
              }),
            );
            break;

          case "error":
            useAttentionStore.getState().processEvent({
              type: "error",
              agentId: null,
              agentName: null,
              taskDescription: null,
              errorType: null,
              message: message.message ?? null,
            });
            break;
        }
      } catch (error) {
        console.error("[WS] Failed to parse message:", error);
      }
    },
    [addEventLog, setGitStatus],
  );

  // ---- WebSocket transport controller (created once, opts synced each render) ----
  const controllerRef = useRef<WebSocketController | null>(null);
  if (controllerRef.current === null) {
    const baseUrl = WS_BASE;
    controllerRef.current = new WebSocketController({
      sessionId,
      enabled,
      baseUrl,
      onMessage: handleMessage,
      onReconnectReset: handleReconnectReset,
      setConnected,
      setSessionId,
      isReplaying: () => useGameStore.getState().isReplaying,
      isCurrentSession: (id) => id === currentSessionIdRef.current,
    });
  }
  // Keep mutable opts fresh so the controller always closes over current state
  // without re-creating the instance (and churning the socket).
  controllerRef.current.opts.sessionId = sessionId;
  controllerRef.current.opts.enabled = enabled;
  controllerRef.current.opts.onMessage = handleMessage;
  controllerRef.current.opts.onReconnectReset = handleReconnectReset;

  // ---- Connection lifecycle ----
  useEffect(() => {
    const isReplaying = useGameStore.getState().isReplaying;
    if (!enabled || !sessionId || isReplaying) {
      controllerRef.current?.disconnect();
      return;
    }

    controllerRef.current?.connect();

    return () => {
      controllerRef.current?.disconnect();
      typingTrackerRef.current?.clear();
    };
  }, [sessionId, enabled]);
}

// ============================================================================
// FULL RESET HANDLER
// ============================================================================

/**
 * Perform a full reset of frontend state.
 * Called on reconnection or when switching sessions.
 */
export function resetFrontendState(): void {
  // Reset store (use resetForSessionSwitch to allow WebSocket reconnection).
  useGameStore.getState().resetForSessionSwitch();

  // Reset machine service.
  agentMachineService.reset();

  // Reset spawn positions.
  resetSpawnIndex();
}
