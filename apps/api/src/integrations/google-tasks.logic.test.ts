import { describe, expect, it } from "vitest";
import { isDueToday, summarizeTasks } from "./google-tasks.logic.js";

describe("google-tasks.logic", () => {
  it("counts open and due-today tasks", () => {
    const now = new Date("2026-08-10T12:00:00.000Z");
    const summary = summarizeTasks(
      [
        { title: "Ship tasks tile", status: "needsAction", due: "2026-08-10T00:00:00.000Z" },
        { title: "Later", status: "needsAction", due: "2026-08-12T00:00:00.000Z" },
        { title: "Done", status: "completed", due: "2026-08-10T00:00:00.000Z" },
      ],
      now,
    );

    expect(summary.openCount).toBe(2);
    expect(summary.dueTodayCount).toBe(1);
    expect(summary.tasks[0]?.title).toBe("Ship tasks tile");
  });

  it("prioritizes upcoming tasks (soonest first) over overdue and undated", () => {
    const now = new Date("2026-08-10T12:00:00.000Z");
    const summary = summarizeTasks(
      [
        { title: "Ancient overdue", status: "needsAction", due: "2025-06-02T00:00:00.000Z" },
        { title: "Next up", status: "needsAction", due: "2026-08-12T00:00:00.000Z" },
        { title: "No date", status: "needsAction" },
        { title: "Later", status: "needsAction", due: "2026-11-10T00:00:00.000Z" },
        { title: "Recent overdue", status: "needsAction", due: "2026-06-06T00:00:00.000Z" },
      ],
      now,
    );

    expect(summary.tasks.map((task) => task.title)).toEqual([
      "Next up",
      "Later",
      "Recent overdue",
      "Ancient overdue",
      "No date",
    ]);
  });

  it("treats missing due dates as not due today", () => {
    expect(isDueToday(null, "2026-08-10")).toBe(false);
  });
});
