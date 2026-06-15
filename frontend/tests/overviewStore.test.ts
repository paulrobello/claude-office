import { describe, expect, it } from "vitest";
import { entriesEqual } from "@/stores/overviewStore";
import type { OverviewEntry } from "@/types";

const baseEntry: OverviewEntry = {
  sessionId: "s1",
  bucket: "working",
  state: "working",
  currentTask: "task A",
  todoDone: 1,
  todoTotal: 3,
  subagentCount: 0,
};

describe("entriesEqual", () => {
  it("treats identical entries as equal (so the store can skip the update)", () => {
    expect(entriesEqual([baseEntry], [{ ...baseEntry }])).toBe(true);
  });

  it("returns false when ANY field differs", () => {
    // Guards against a new OverviewEntry field silently failing to trigger a
    // re-render: entriesEqual compares every present field, so varying each
    // known field must be detected.
    const variants: Record<string, unknown> = {
      sessionId: "s2",
      bucket: "done",
      state: "idle",
      currentTask: "task B",
      todoDone: 2,
      todoTotal: 4,
      subagentCount: 1,
    };
    // Iterate the entry's own keys so a newly-added field included above is
    // checked automatically.
    for (const key of Object.keys(baseEntry)) {
      const changed = { ...baseEntry, [key]: variants[key] } as OverviewEntry;
      expect(entriesEqual([baseEntry], [changed])).toBe(false);
    }
  });

  it("treats an omitted optional field the same as an explicit undefined", () => {
    const withoutTask = { ...baseEntry } as OverviewEntry;
    delete (withoutTask as Record<string, unknown>).currentTask;
    const withUndefined = {
      ...baseEntry,
      currentTask: undefined,
    } as OverviewEntry;
    expect(entriesEqual([withoutTask], [withUndefined])).toBe(true);
  });

  it("returns false for different-length lists", () => {
    expect(entriesEqual([baseEntry], [])).toBe(false);
  });
});
