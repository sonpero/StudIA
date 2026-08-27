import { describe, expect, it } from "vitest";
import { daysOverdue } from "./days-overdue.js";

describe("daysOverdue", () => {
  it("is 0 when due is in the future", () => {
    expect(daysOverdue("2026-01-10T00:00:00.000Z", new Date("2026-01-01T00:00:00.000Z"))).toBe(0);
  });

  it("is 0 exactly on the due date", () => {
    expect(daysOverdue("2026-01-01T00:00:00.000Z", new Date("2026-01-01T00:00:00.000Z"))).toBe(0);
  });

  it("counts whole days elapsed since the due date", () => {
    expect(daysOverdue("2026-01-01T00:00:00.000Z", new Date("2026-01-04T00:00:00.000Z"))).toBe(3);
  });

  it("floors a partial day", () => {
    expect(daysOverdue("2026-01-01T00:00:00.000Z", new Date("2026-01-02T12:00:00.000Z"))).toBe(1);
  });
});
