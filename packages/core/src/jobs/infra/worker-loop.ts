import type { Clock } from "../../shared/index.js";
import { recoverStaleJobs } from "../application/recover-stale-jobs.js";
import { runWorkerTick } from "../application/run-worker-tick.js";
import type { JobHandler, JobQueue } from "../domain/ports.js";

export interface WorkerLoopDeps {
  jobQueue: JobQueue;
  handlers: Map<string, JobHandler>;
  clock: Clock;
}

export interface WorkerLoopSignal {
  stopped: boolean;
}

const ACTIVE_INTERVAL_MS = 1000;
const IDLE_INTERVAL_MS = 5000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The real, timer-driven loop: intentionally not unit tested (docs/TESTING.md
// rules out fake timers — "something took the clock implicitly and that is
// the bug"). Its actual logic (claim/dispatch/record, recovery) lives in
// runWorkerTick/recoverStaleJobs, which are fully tested with an injected
// `now`. `signal` lets the caller (apps/worker's entrypoint) request a clean
// stop, e.g. on SIGTERM.
export async function runWorkerLoop(deps: WorkerLoopDeps, signal: WorkerLoopSignal): Promise<void> {
  const recovered = await recoverStaleJobs({ jobQueue: deps.jobQueue }, deps.clock.now());
  if (recovered > 0) {
    console.log(`[worker] recovered ${String(recovered)} stale job(s) from a previous run`);
  }

  while (!signal.stopped) {
    const outcome = await runWorkerTick({ jobQueue: deps.jobQueue, handlers: deps.handlers }, deps.clock.now());
    await sleep(outcome === "claimed" ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS);
  }
}
