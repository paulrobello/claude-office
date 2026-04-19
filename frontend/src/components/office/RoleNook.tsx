"use client";

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
  const isActive = sessionId !== null;

  const handleClick = () => {
    if (isActive && sessionId && onNookClick) {
      onNookClick(runId, sessionId);
    }
  };

  return (
    <div
      role={isActive ? "button" : undefined}
      tabIndex={isActive ? 0 : undefined}
      onClick={isActive ? handleClick : undefined}
      onKeyDown={
        isActive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
      title={
        isActive && sessionId
          ? `${role} — session: ${sessionId}`
          : `${role} — unoccupied`
      }
      className="flex flex-col items-center justify-center gap-2 rounded-xl p-4"
      style={{
        background: isActive ? "#0f172a" : "#070e1a",
        border: `2px solid ${isActive ? "#334155" : "#1e293b"}`,
        opacity: isActive ? 1 : 0.45,
        cursor: isActive ? "pointer" : "default",
        minWidth: "120px",
        minHeight: "120px",
        transition: "opacity 200ms ease, border-color 200ms ease",
      }}
    >
      {/* Character indicator */}
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
        style={{
          background: isActive ? "#1e293b" : "#0f172a",
          border: `1px solid ${isActive ? "#475569" : "#1e293b"}`,
        }}
      >
        {isActive ? ROLE_EMOJI[role] : ROLE_INITIAL[role]}
      </div>

      {/* Role label */}
      <p
        className="text-xs font-mono font-semibold"
        style={{ color: isActive ? "#e2e8f0" : "#334155" }}
      >
        {role}
      </p>

      {/* Session metadata (active only) */}
      {isActive && sessionId && (
        <p className="text-xs font-mono" style={{ color: "#475569" }}>
          {sessionId.slice(0, 8)}
        </p>
      )}

      {/* Inactive label */}
      {!isActive && (
        <p className="text-xs font-mono" style={{ color: "#1e293b" }}>
          empty
        </p>
      )}
    </div>
  );
}
