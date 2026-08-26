import { describe, expect, it } from "vitest";
import { transitionJobStatus, type JobTransitionEvent } from "./transitions.js";
import type { JobStatus } from "./types.js";

const ALL_STATUSES: JobStatus[] = ["pending", "running", "done", "failed"];
const ALL_EVENTS: JobTransitionEvent[] = [
  { kind: "claim" },
  { kind: "complete" },
  { kind: "retry" },
  { kind: "exhaust" },
  { kind: "recover" },
];

// The exhaustive test docs/modules/jobs.md asks for: every (status, event)
// combination, asserting exactly the 5 documented transitions succeed and
// everything else is rejected.
const LEGAL: { from: JobStatus; event: JobTransitionEvent["kind"]; to: JobStatus }[] = [
  { from: "pending", event: "claim", to: "running" },
  { from: "running", event: "complete", to: "done" },
  { from: "running", event: "retry", to: "pending" },
  { from: "running", event: "exhaust", to: "failed" },
  { from: "running", event: "recover", to: "pending" },
];

describe("transitionJobStatus", () => {
  for (const { from, event, to } of LEGAL) {
    it(`allows ${from} --${event}--> ${to}`, () => {
      expect(transitionJobStatus(from, { kind: event })).toEqual({ ok: true, value: to });
    });
  }

  for (const from of ALL_STATUSES) {
    for (const event of ALL_EVENTS) {
      const isLegal = LEGAL.some((t) => t.from === from && t.event === event.kind);
      if (isLegal) continue;

      it(`rejects ${from} --${event.kind}--> *`, () => {
        expect(transitionJobStatus(from, event)).toEqual({ ok: false, error: "illegal-transition" });
      });
    }
  }
});
