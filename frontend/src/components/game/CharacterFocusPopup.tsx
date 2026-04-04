/**
 * CharacterFocusPopup
 *
 * DOM overlay shown when the user clicks a character (boss or agent).
 * Provides a quick chat input and a shell-open button.
 *
 * Copy & Focus: copies the typed message to clipboard, then brings the user's
 *   existing Terminal / iTerm2 window to the foreground so they can paste.
 * Focus Terminal: same as above, without copying a message.
 */

"use client";

import { useRef, useState, useEffect, useCallback, type ReactNode } from "react";
import { Terminal } from "lucide-react";
import { useGameStore } from "@/stores/gameStore";

export function CharacterFocusPopup(): ReactNode {
  const focusedCharacter = useGameStore((s) => s.focusedCharacter);
  const setFocusedCharacter = useGameStore((s) => s.setFocusedCharacter);

  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset message and focus input each time the popup opens
  useEffect(() => {
    if (focusedCharacter) {
      setMessage("");
      // Small delay so the element is visible before focusing
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [focusedCharacter?.agentId, focusedCharacter?.isBoss]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dismiss on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocusedCharacter(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setFocusedCharacter]);

  const callFocus = useCallback(
    async (withMessage: boolean) => {
      if (!focusedCharacter) return;
      setBusy(true);
      try {
        await fetch(
          `http://localhost:8000/api/v1/sessions/${focusedCharacter.sessionId}/focus`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              withMessage && message ? { message } : {},
            ),
          },
        );
      } finally {
        setBusy(false);
        setFocusedCharacter(null);
      }
    },
    [focusedCharacter, message, setFocusedCharacter],
  );

  if (!focusedCharacter) return null;

  const displayName =
    focusedCharacter.name ??
    (focusedCharacter.isBoss ? "Boss" : "Agent");

  return (
    <>
      {/* Transparent backdrop — click to dismiss */}
      <div
        className="absolute inset-0 z-40"
        onClick={() => setFocusedCharacter(null)}
      />

      {/* Popup centered over the canvas */}
      <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
        <div
          className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl p-4 w-72 pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0 mr-2">
              <div className="text-white font-mono text-sm font-bold truncate">
                {displayName}
              </div>
              {focusedCharacter.currentTask && (
                <div className="text-slate-400 text-xs truncate mt-0.5">
                  {focusedCharacter.currentTask}
                </div>
              )}
            </div>
            <button
              onClick={() => setFocusedCharacter(null)}
              className="text-slate-500 hover:text-white text-xs flex-shrink-0 mt-0.5"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>

          {/* Message input */}
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "y") {
                e.preventDefault();
                void callFocus(!!message);
              } else if (e.key === "Enter") {
                void callFocus(!!message);
              }
            }}
            placeholder="Quick message… (⌘Y to copy &amp; focus)"
            className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-xs font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500 mb-3"
          />

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => void callFocus(true)}
              disabled={busy || !message.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-mono py-1.5 px-3 rounded transition-colors"
            >
              📋 Copy &amp; Focus
            </button>
            <button
              onClick={() => void callFocus(false)}
              disabled={busy}
              className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white py-1.5 px-3 rounded transition-colors"
              title="Focus Terminal"
              aria-label="Focus Terminal"
            >
              <Terminal size={14} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
