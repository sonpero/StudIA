import { err, ok, type Result } from "../../shared/index.js";
import type { JobStatus } from "./types.js";

export type JobTransitionEvent =
  | { kind: "claim" } // pending -> running
  | { kind: "complete" } // running -> done
  | { kind: "retry" } // running -> pending, attempts < maxAttempts, runAfter pushed back
  | { kind: "exhaust" } // running -> failed, attempts >= maxAttempts (or fail(..., { terminal: true }))
  | { kind: "recover" }; // running -> pending, startup recovery, attempts untouched

// The whole state machine from docs/modules/jobs.md in one place. Anything
// not listed here is a bug (jobs.md).
export function transitionJobStatus(from: JobStatus, event: JobTransitionEvent): Result<JobStatus, "illegal-transition"> {
  if (from === "pending" && event.kind === "claim") return ok("running");
  if (from === "running" && event.kind === "complete") return ok("done");
  if (from === "running" && event.kind === "retry") return ok("pending");
  if (from === "running" && event.kind === "exhaust") return ok("failed");
  if (from === "running" && event.kind === "recover") return ok("pending");
  return err("illegal-transition");
}
