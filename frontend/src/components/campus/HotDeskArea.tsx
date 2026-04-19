"use client";

import { useNavigationStore } from "@/stores/navigationStore";
import { selectHotDeskSessions } from "@/stores/runStore";

export interface HotDeskSession {
  id: string;
  displayName: string | null;
  projectName: string | null;
  status: string;
  runId?: string | null;
}

function HotDeskBooth({
  session,
}: {
  session: HotDeskSession;
}): React.ReactNode {
  const goToNook = useNavigationStore((s) => s.goToNook);
  const label =
    session.displayName ?? session.projectName ?? session.id.slice(0, 8);
  const isActive = session.status === "active";

  return (
    <button
      onClick={() => goToNook(null, session.id)}
      className="flex flex-col gap-1.5 rounded p-3 text-left cursor-pointer transition-colors"
      style={{
        background: "#1e293b",
        border: "1px solid #334155",
        minWidth: "120px",
        maxWidth: "160px",
      }}
    >
      <div className="flex items-center gap-1.5">
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: isActive ? "#10b981" : "#475569" }}
        />
        <span
          className="text-xs font-mono font-bold truncate"
          style={{ color: "#e2e8f0" }}
        >
          {label}
        </span>
      </div>
      <span className="text-xs font-mono" style={{ color: "#64748b" }}>
        ad-hoc
      </span>
    </button>
  );
}

export interface HotDeskAreaProps {
  sessions: HotDeskSession[];
}

export function HotDeskArea({ sessions }: HotDeskAreaProps): React.ReactNode {
  const hotDeskSessions = selectHotDeskSessions(sessions);

  return (
    <div
      className="rounded-lg p-4 flex flex-col gap-3"
      style={{ background: "#0f172a", border: "1px solid #1e293b" }}
    >
      <div className="flex items-center gap-2">
        <span
          className="text-sm font-mono font-bold"
          style={{ color: "#94a3b8" }}
        >
          Hot Desk
        </span>
        <span
          className="text-xs font-mono px-1.5 py-0.5 rounded"
          style={{ background: "#1e293b", color: "#64748b" }}
        >
          {hotDeskSessions.length}
        </span>
      </div>

      {hotDeskSessions.length === 0 ? (
        <p className="text-xs font-mono" style={{ color: "#475569" }}>
          No ad-hoc sessions
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {hotDeskSessions.map((session) => (
            <HotDeskBooth key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}
