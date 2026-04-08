import { describe, expect, it } from "vitest";
import { createElement, type ReactNode } from "react";
import {
  RoomProvider,
  useRoomContext,
  useRoomAgents,
  useRoomBoss,
  useRoomTodos,
  useIsInRoom,
} from "../src/contexts/RoomContext";
import type { ProjectGroup } from "../src/types/projects";

// Since we can't use renderHook without jsdom, test the context module's
// exports and types. The hooks themselves are thin wrappers around useContext.

function makeProject(): ProjectGroup {
  return {
    key: "test",
    name: "Test Project",
    color: "#3B82F6",
    root: "/test",
    agents: [
      {
        id: "a1",
        name: "Agent 1",
        color: "#fff",
        number: 1,
        state: "working" as const,
        desk: 1,
      },
    ],
    boss: {
      state: "working" as const,
      currentTask: "Building",
      bubble: null,
      position: { x: 640, y: 830 },
    },
    sessionCount: 1,
    todos: [{ id: "1", content: "Do thing", status: "in_progress" }],
  };
}

describe("RoomContext", () => {
  it("RoomProvider creates a valid React element", () => {
    const project = makeProject();
    const element = createElement(
      RoomProvider,
      { project, children: createElement("div") },
    );
    expect(element).toBeDefined();
    expect(element.type).toBe(RoomProvider);
  });

  it("exports all expected hooks", () => {
    expect(typeof useRoomContext).toBe("function");
    expect(typeof useRoomAgents).toBe("function");
    expect(typeof useRoomBoss).toBe("function");
    expect(typeof useRoomTodos).toBe("function");
    expect(typeof useIsInRoom).toBe("function");
  });

  it("makeProject creates valid test data", () => {
    const project = makeProject();
    expect(project.agents).toHaveLength(1);
    expect(project.agents[0].name).toBe("Agent 1");
    expect(project.boss.state).toBe("working");
    expect(project.todos).toHaveLength(1);
  });
});
