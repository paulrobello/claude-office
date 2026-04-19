"use client";

import { useEffect, useRef, useState } from "react";
import "../../styles/nook-animations.css";

export type NookRole = "Designer" | "Coder" | "Verifier" | "Reviewer";

const ROLE_EMOJI: Record<NookRole, string> = {
  Designer: "🎨",
  Coder: "🔨",
  Verifier: "🔍",
  Reviewer: "🔎",
};

const ROLE_INITIAL: Record<NookRole, string> = {
  Designer: "D",
  Coder: "C",
  Verifier: "V",
  Reviewer: "R",
};

interface RoleNookProps {
  role: NookRole;
  sessionId: string | null;
  runId: string;
  onNookClick?: (runId: string, sessionId: string) => void;
}

export function RoleNook({
  role,
  sessionId,
  runId,
  onNookClick,
}: RoleNookProps): React.ReactNode {
  const prevSessionIdRef = useRef<string | null>(sessionId);
  // visibleSessionId stays set during leave animation so character remains visible
  const [visibleSessionId, setVisibleSessionId] = useState<string | null>(
    sessionId,
  );
  const [charClass, setCharClass] = useState<"char-arrive" | "char-leave" | "">(
    "",
  );

  useEffect(() => {
    const prev = prevSessionIdRef.current;
    prevSessionIdRef.current = sessionId;

    if (prev === null && sessionId !== null) {
      queueMicrotask(() => {
        setVisibleSessionId(sessionId);
        setCharClass("char-arrive");
      });
    } else if (prev !== null && sessionId === null) {
      queueMicrotask(() => setCharClass("char-leave"));
      const timer = setTimeout(() => {
        setVisibleSessionId(null);
        setCharClass("");
      }, 320);
      return () => clearTimeout(timer);
    } else if (sessionId !== null && sessionId !== prev) {
      queueMicrotask(() => {
        setVisibleSessionId(sessionId);
        setCharClass("char-arrive");
      });
    }
  }, [sessionId]);

  const isLit = sessionId !== null;
  const hasChar = visibleSessionId !== null;

  const handleClick = () => {
    if (sessionId && onNookClick) {
      onNookClick(runId, sessionId);
    }
  };

  return (
    <div
      role={sessionId ? "button" : undefined}
      tabIndex={sessionId ? 0 : undefined}
      onClick={sessionId ? handleClick : undefined}
      onKeyDown={
        sessionId
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
      title={
        sessionId ? `${role} — session: ${sessionId}` : `${role} — unoccupied`
      }
      className="flex flex-col items-center justify-center gap-2 rounded-xl p-4"
      style={{
        background: isLit ? "#0f172a" : "#070e1a",
        border: `2px solid ${isLit ? "#334155" : "#1e293b"}`,
        opacity: isLit ? 1 : 0.45,
        cursor: sessionId ? "pointer" : "default",
        minWidth: "120px",
        minHeight: "120px",
        transition: "opacity 400ms ease, border-color 400ms ease",
      }}
    >
      {/* Character indicator — visible during arrive/leave animations */}
      {hasChar ? (
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${charClass}`}
          style={{
            background: "#1e293b",
            border: "1px solid #475569",
          }}
          onAnimationEnd={() => {
            if (charClass === "char-arrive") setCharClass("");
          }}
        >
          {ROLE_EMOJI[role]}
        </div>
      ) : (
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
          style={{
            background: "#0f172a",
            border: "1px solid #1e293b",
          }}
        >
          {ROLE_INITIAL[role]}
        </div>
      )}

      {/* Role label */}
      <p
        className="text-xs font-mono font-semibold"
        style={{ color: isLit ? "#e2e8f0" : "#334155" }}
      >
        {role}
      </p>

      {/* Session metadata (visible during arrive/leave) */}
      {hasChar && (
        <p className="text-xs font-mono" style={{ color: "#475569" }}>
          {visibleSessionId.slice(0, 8)}
        </p>
      )}

      {/* Inactive label */}
      {!hasChar && (
        <p className="text-xs font-mono" style={{ color: "#1e293b" }}>
          empty
        </p>
      )}
    </div>
  );
}
