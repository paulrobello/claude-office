"use client";

/**
 * TodoListMode - Mode 0: Todo list with auto-scroll and status icons.
 *
 * Displays up to 5 visible todo items at a time. When a task is in_progress,
 * it centers that task in the viewport. Otherwise items auto-scroll every 3
 * seconds when the list exceeds the visible limit.
 */

import { useState, useEffect, useMemo, type ReactNode } from "react";
import type { TodoItem } from "@/types";

export interface TodoListModeProps {
  todos: TodoItem[];
}

const MAX_VISIBLE = 5;

function getStatusIcon(status: string): string {
  switch (status) {
    case "completed":
      return "✓";
    case "in_progress":
      return "▶";
    default:
      return "○";
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case "completed":
      return "#22c55e";
    case "in_progress":
      return "#3b82f6";
    default:
      return "#4b5563";
  }
}

export function TodoListMode({ todos }: TodoListModeProps): ReactNode {
  const [autoScrollOffset, setAutoScrollOffset] = useState(0);

  const inProgressIndex = todos.findIndex((t) => t.status === "in_progress");

  const baseOffset = useMemo(() => {
    if (inProgressIndex >= 0 && todos.length > MAX_VISIBLE) {
      return Math.max(
        0,
        Math.min(
          inProgressIndex - Math.floor(MAX_VISIBLE / 2),
          todos.length - MAX_VISIBLE,
        ),
      );
    }
    return 0;
  }, [inProgressIndex, todos.length]);

  const allCompleted =
    todos.length > 0 && todos.every((t) => t.status === "completed");

  useEffect(() => {
    if (todos.length <= MAX_VISIBLE || inProgressIndex >= 0 || allCompleted) {
      return;
    }

    const interval = setInterval(() => {
      setAutoScrollOffset((prev) => {
        const maxOffset = todos.length - MAX_VISIBLE;
        return prev >= maxOffset ? 0 : prev + 1;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [todos.length, inProgressIndex, allCompleted]);

  const scrollOffset = inProgressIndex >= 0 ? baseOffset : autoScrollOffset;
  const visibleTodos = todos.slice(scrollOffset, scrollOffset + MAX_VISIBLE);

  if (todos.length === 0) {
    return (
      <pixiContainer x={165} y={50} scale={0.5}>
        <pixiText
          text="No tasks yet"
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
      {visibleTodos.map((todo, index) => (
        <pixiContainer key={`todo-${scrollOffset + index}`} y={2 + index * 24}>
          <pixiText
            text={getStatusIcon(todo.status)}
            x={16}
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 12,
              fill: getStatusColor(todo.status),
            }}
            resolution={2}
          />
          <pixiText
            text={
              todo.status === "in_progress" && todo.activeForm
                ? todo.activeForm.slice(0, 42)
                : todo.content.slice(0, 42)
            }
            x={32}
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 11,
              fill: todo.status === "completed" ? "#6b7280" : "#1f2937",
              fontWeight: todo.status === "in_progress" ? "bold" : "normal",
            }}
            resolution={2}
          />
        </pixiContainer>
      ))}

      {todos.length > MAX_VISIBLE && (
        <pixiContainer x={165} y={130} scale={0.5}>
          <pixiText
            text={`${scrollOffset + 1}-${Math.min(scrollOffset + MAX_VISIBLE, todos.length)}/${todos.length}`}
            anchor={0.5}
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 18,
              fill: "#9ca3af",
            }}
            resolution={2}
          />
        </pixiContainer>
      )}
    </pixiContainer>
  );
}
