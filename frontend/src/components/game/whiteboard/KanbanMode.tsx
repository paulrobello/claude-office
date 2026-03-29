"use client";

/**
 * KanbanMode - Mode 11: Kanban board with Todo / In Progress / Done columns.
 *
 * Reads kanbanTasks from whiteboardData and renders each task as a sticky note
 * inside the appropriate column. Shows subject text, Linear badge (if present),
 * and assignee (if present).
 *
 * Hotkey: K
 */

import { Graphics } from "pixi.js";
import { type ReactNode } from "react";
import type { KanbanTask, WhiteboardData } from "@/types";

// ============================================================================
// LAYOUT CONSTANTS
// ============================================================================

const BOARD_W = 310;
const COL_COUNT = 3;
const COL_W = Math.floor(BOARD_W / COL_COUNT); // ~103px per column
const COL_PAD = 6;
const NOTE_H = 32;
const NOTE_GAP = 3;
const COL_HEADER_H = 16;
const MAX_NOTES_PER_COL = 4;
const COL_H = COL_HEADER_H + MAX_NOTES_PER_COL * (NOTE_H + NOTE_GAP) + NOTE_GAP;

// ============================================================================
// COLUMN DEFINITIONS
// ============================================================================

const COL_DEFS = [
  {
    status: "pending",
    label: "TODO",
    headerColor: 0x64748b,
    noteColor: 0xf1f5f9,
    textColor: "#374151",
    accentColor: 0x94a3b8,
  },
  {
    status: "in_progress",
    label: "IN PROGRESS",
    headerColor: 0x3b82f6,
    noteColor: 0xeff6ff,
    textColor: "#1e3a5f",
    accentColor: 0x60a5fa,
  },
  {
    status: "completed",
    label: "DONE",
    headerColor: 0x22c55e,
    noteColor: 0xf0fdf4,
    textColor: "#14532d",
    accentColor: 0x4ade80,
  },
] as const;

// ============================================================================
// STICKY NOTE COMPONENT
// ============================================================================

interface StickyNoteProps {
  task: KanbanTask;
  x: number;
  y: number;
  noteColor: number;
  textColor: string;
  accentColor: number;
}

function StickyNote({
  task,
  x,
  y,
  noteColor,
  textColor,
  accentColor,
}: StickyNoteProps): ReactNode {
  const noteW = COL_W - COL_PAD * 2;

  return (
    <pixiContainer x={x} y={y}>
      {/* Note background */}
      <pixiGraphics
        draw={(g: Graphics) => {
          g.clear();
          g.roundRect(0, 0, noteW, NOTE_H, 2);
          g.fill(noteColor);
          g.stroke({ width: 1, color: accentColor, alpha: 0.5 });
        }}
      />

      {/* Subject text — truncate to fit */}
      <pixiText
        text={task.subject.slice(0, 16)}
        x={4}
        y={3}
        style={{
          fontFamily: '"Courier New", monospace',
          fontSize: 9,
          fontWeight: "bold",
          fill: textColor,
        }}
        resolution={2}
      />

      {/* Linear badge */}
      {task.linearId && (
        <pixiText
          text={task.linearId.slice(0, 10)}
          x={4}
          y={13}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 8,
            fill: "#6366f1",
          }}
          resolution={2}
        />
      )}

      {/* Assignee */}
      {task.assignee && (
        <pixiText
          text={`@${task.assignee.slice(0, 8)}`}
          x={4}
          y={task.linearId ? 22 : 13}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 8,
            fill: "#6b7280",
          }}
          resolution={2}
        />
      )}
    </pixiContainer>
  );
}

// ============================================================================
// KANBAN COLUMN COMPONENT
// ============================================================================

interface KanbanColumnProps {
  colIndex: number;
  tasks: KanbanTask[];
  label: string;
  headerColor: number;
  noteColor: number;
  textColor: string;
  accentColor: number;
}

function KanbanColumn({
  colIndex,
  tasks,
  label,
  headerColor,
  noteColor,
  textColor,
  accentColor,
}: KanbanColumnProps): ReactNode {
  const colX = colIndex * COL_W;
  const colH = COL_H;

  return (
    <pixiContainer x={colX}>
      {/* Column background */}
      <pixiGraphics
        draw={(g: Graphics) => {
          g.clear();
          g.rect(COL_PAD / 2, 0, COL_W - COL_PAD / 2, colH);
          g.fill({ color: 0xf8fafc, alpha: 0.6 });
        }}
      />

      {/* Column header bar */}
      <pixiGraphics
        draw={(g: Graphics) => {
          g.clear();
          g.roundRect(COL_PAD / 2, 0, COL_W - COL_PAD / 2, COL_HEADER_H, 2);
          g.fill(headerColor);
        }}
      />

      {/* Column header label */}
      <pixiContainer x={COL_W / 2} y={COL_HEADER_H / 2} scale={0.5}>
        <pixiText
          text={label}
          anchor={0.5}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 16,
            fontWeight: "bold",
            fill: "#ffffff",
          }}
          resolution={2}
        />
      </pixiContainer>

      {/* Task count badge */}
      <pixiContainer x={COL_W - COL_PAD - 2} y={COL_HEADER_H / 2} scale={0.5}>
        <pixiText
          text={String(tasks.length)}
          anchor={{ x: 1, y: 0.5 }}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 14,
            fill: "#ffffff",
          }}
          resolution={2}
        />
      </pixiContainer>

      {/* Sticky notes */}
      {tasks.slice(0, MAX_NOTES_PER_COL).map((task, i) => (
        <StickyNote
          key={task.taskId}
          task={task}
          x={COL_PAD}
          y={COL_HEADER_H + NOTE_GAP + i * (NOTE_H + NOTE_GAP)}
          noteColor={noteColor}
          textColor={textColor}
          accentColor={accentColor}
        />
      ))}

      {/* Overflow indicator */}
      {tasks.length > MAX_NOTES_PER_COL && (
        <pixiContainer
          x={COL_W / 2}
          y={COL_HEADER_H + MAX_NOTES_PER_COL * (NOTE_H + NOTE_GAP) + 4}
          scale={0.5}
        >
          <pixiText
            text={`+${tasks.length - MAX_NOTES_PER_COL} more`}
            anchor={0.5}
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 14,
              fill: "#9ca3af",
            }}
            resolution={2}
          />
        </pixiContainer>
      )}
    </pixiContainer>
  );
}

// ============================================================================
// KANBAN MODE
// ============================================================================

interface KanbanModeProps {
  data: WhiteboardData;
}

export function KanbanMode({ data }: KanbanModeProps): ReactNode {
  const tasks: KanbanTask[] = data.kanbanTasks ?? [];

  if (tasks.length === 0) {
    return (
      <pixiContainer x={165} y={50} scale={0.5}>
        <pixiText
          text="No kanban tasks"
          anchor={0.5}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 24,
            fill: "#9ca3af",
          }}
          resolution={2}
        />
      </pixiContainer>
    );
  }

  return (
    <pixiContainer>
      {COL_DEFS.map((col, i) => {
        const colTasks = tasks.filter((t) => t.status === col.status);
        return (
          <KanbanColumn
            key={col.status}
            colIndex={i}
            tasks={colTasks}
            label={col.label}
            headerColor={col.headerColor}
            noteColor={col.noteColor}
            textColor={col.textColor}
            accentColor={col.accentColor}
          />
        );
      })}
    </pixiContainer>
  );
}
