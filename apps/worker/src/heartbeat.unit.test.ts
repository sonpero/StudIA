import { describe, expect, it } from "vitest";
import { heartbeatMessage } from "./heartbeat.js";

describe("heartbeatMessage", () => {
  it("reports the worker is alive at the given time", () => {
    const now = new Date("2026-03-01T08:00:00Z");
    expect(heartbeatMessage(now)).toBe("worker alive at 2026-03-01T08:00:00.000Z");
  });
});
