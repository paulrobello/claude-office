"use client";

import { useEffect, useRef, useState } from "react";
import "@/styles/task-animations.css";
import type { PlanTask, PlanTaskStatus } from "@/types/run";

interface TaskWhiteboardProps {
  tasks: PlanTask[];
}

const COLUMNS: { status: PlanTaskStatus; label: string }[] = [
  { status: "todo", label: "Todo" },
  { status: "in_progress", label: "In Progress" },
  { status: "done", label: "Done" },
];

const STATUS_COLORS: Record<
  PlanTaskStatus,
  { bg: string; border: string; text: string }
> = {
  todo: { bg: "#fef9c3", border: "#fde047", text: "#713f12" },
  in_progress: { bg: "#fef3c7", border: "#f59e0b", text: "#78350f" },
  done: { bg: "#dcfce7", border: "#86efac", text: "#14532d" },
};

const COLUMN_HEADER_COLORS: Record<PlanTaskStatus, string> = {
  todo: "#94a3b8",
  in_progress: "#f59e0b",
  done: "#10b981",
};

function StickyCard({
  task,
  isSliding,
}: {
  task: PlanTask;
  isSliding: boolean;
}) {
  const colors = STATUS_COLORS[task.status];
  return (
    <div
      className={isSliding ? "sticky-slide-in" : undefined}
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: "4px",
        padding: "6px 8px",
        boxShadow: "1px 2px 4px rgba(0,0,0,0.12)",
      }}
    >
      <div className="flex items-center gap-1">
        {task.status === "done" && (
          <span
            className={isSliding ? "checkmark-appear" : undefined}
            style={{
              color: colors.text,
              fontSize: "10px",
              fontWeight: 700,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ✓
          </span>
        )}
        <p
          className="text-xs font-mono leading-snug"
          style={{ color: colors.text, wordBreak: "break-word" }}
        >
          {task.title}
        </p>
      </div>
      {task.assignedSessionId && (
        <p
          className="text-xs font-mono mt-1"
          style={{ color: colors.text, opacity: 0.6 }}
        >
          {task.assignedSessionId.slice(-6)}
        </p>
      )}
    </div>
  );
}

export function TaskWhiteboard({ tasks }: TaskWhiteboardProps) {
  const prevStatusRef = useRef<Map<string, PlanTaskStatus>>(new Map());
  const [slidingTasks, setSlidingTasks] = useState<Set<string>>(new Set());

  useEffect(() => {
    const newSliding = new Set<string>();
    tasks.forEach((task) => {
      const prev = prevStatusRef.current.get(task.id);
      if (prev !== undefined && prev !== task.status) {
        newSliding.add(task.id);
      }
      prevStatusRef.current.set(task.id, task.status);
    });

    if (newSliding.size === 0) return;

    let active = true;
    queueMicrotask(() => {
      if (active) setSlidingTasks(newSliding);
    });
    const timer = setTimeout(() => {
      if (active) setSlidingTasks(new Set());
    }, 450);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [tasks]);

  const byStatus = (status: PlanTaskStatus) =>
    tasks.filter((t) => t.status === status);

  return (
    <div
      style={{
        background: "#0f172a",
        border: "1px solid #1e293b",
        borderRadius: "8px",
        padding: "12px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        minWidth: 0,
      }}
    >
      <p
        className="text-xs font-mono font-semibold shrink-0"
        style={{ color: "#64748b" }}
      >
        TASKS
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "8px",
          minHeight: 0,
        }}
      >
        {COLUMNS.map(({ status, label }) => {
          const col = byStatus(status);
          const headerColor = COLUMN_HEADER_COLORS[status];
          return (
            <div
              key={status}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                background: "#0a0f1e",
                borderRadius: "6px",
                padding: "8px",
                minHeight: "80px",
              }}
            >
              <div className="flex items-center gap-1.5 shrink-0">
                <div
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: headerColor,
                  }}
                />
                <span
                  className="text-xs font-mono font-semibold"
                  style={{ color: headerColor }}
                >
                  {label}
                </span>
                <span
                  className="text-xs font-mono ml-auto"
                  style={{ color: "#334155" }}
                >
                  {col.length}
                </span>
              </div>

              {col.length === 0 ? (
                <p
                  className="text-xs font-mono"
                  style={{ color: "#1e293b", marginTop: "4px" }}
                >
                  — empty —
                </p>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                  }}
                >
                  {col.map((task) => (
                    <StickyCard
                      key={task.id}
                      task={task}
                      isSliding={slidingTasks.has(task.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
