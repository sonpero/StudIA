import { describe, expect, it } from "vitest";
import { fakePlanningRepository } from "./fakes.js";
import { markDayCompleted } from "./mark-day-completed.js";

describe("markDayCompleted", () => {
  it("records history only, never a schedule change", async () => {
    const repo = fakePlanningRepository();
    await markDayCompleted({ repo }, "u1", "2026-03-02");
    expect(await repo.getHistory("u1")).toEqual([{ date: "2026-03-02", completed: true }]);
  });

  it("is idempotent: marking the same day twice does not duplicate the entry", async () => {
    const repo = fakePlanningRepository();
    await markDayCompleted({ repo }, "u1", "2026-03-02");
    await markDayCompleted({ repo }, "u1", "2026-03-02");
    expect(await repo.getHistory("u1")).toEqual([{ date: "2026-03-02", completed: true }]);
  });
});
