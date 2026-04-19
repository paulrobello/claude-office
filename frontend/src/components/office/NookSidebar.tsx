"use client";

import type { NookRole } from "./RoleNook";

const ROLE_EMOJI: Record<NookRole, string> = {
  Designer: "🎨",
  Coder: "🔨",
  Verifier: "🔍",
  Reviewer: "🔎",
};

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

interface NookSidebarProps {
  role: NookRole | null;
  model: string | null;
  sessionId: string | null;
  taskId: string | null;
  taskTitle: string | null;
  elapsedSeconds: number | null;
  onBack: () => void;
}

export function NookSidebar({
  role,
  model,
  sessionId,
  taskId,
  taskTitle,
  elapsedSeconds,
  onBack,
}: NookSidebarProps): React.ReactNode {
  return (
    <aside
      className="flex flex-col gap-4 p-4 font-mono text-sm overflow-y-auto shrink-0"
      style={{
        width: "220px",
        background: "#0a0e1a",
        borderLeft: "1px solid #1e293b",
      }}
    >
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors mb-2"
      >
        ← Back
      </button>

      {/* Role */}
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
          Role
        </p>
        <p className="text-white flex items-center gap-2">
          {role ? (
            <>
              <span>{ROLE_EMOJI[role]}</span>
              <span>{role}</span>
            </>
          ) : (
            <span className="text-slate-500">—</span>
          )}
        </p>
      </div>

      {/* Session ID */}
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
          Session
        </p>
        <p
          className="text-purple-400 text-xs break-all"
          title={sessionId ?? undefined}
        >
          {sessionId ?? "—"}
        </p>
      </div>

      {/* Task */}
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
          Task
        </p>
        {taskTitle ? (
          <>
            <p className="text-amber-400 text-xs leading-snug">{taskTitle}</p>
            {taskId && (
              <p className="text-slate-500 text-xs mt-0.5">{taskId}</p>
            )}
          </>
        ) : (
          <p className="text-slate-500 text-xs">—</p>
        )}
      </div>

      {/* Model */}
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
          Model
        </p>
        <p className="text-emerald-400 text-xs break-all">{model ?? "—"}</p>
      </div>

      {/* Elapsed */}
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
          Elapsed
        </p>
        <p className="text-white">
          {elapsedSeconds != null ? formatElapsed(elapsedSeconds) : "—"}
        </p>
      </div>
    </aside>
  );
}
