#!/usr/bin/env node
// Single Railway service (CLAUDE.md): apps/api and apps/worker run as two
// processes in the same container, started from here rather than from the
// Dockerfile CMD directly, because a container has exactly one PID 1 and
// only PID 1 receives SIGTERM from the platform. Each service is spawned by
// invoking its local tsx binary directly (not "pnpm --filter ... run start")
// so this script is the immediate parent of the real process — no shell or
// pnpm layer in between that could swallow or fail to forward the signal.
//
// docs/modules/jobs.md's recoverStaleJobs() depends on the worker actually
// getting a chance to be told to stop rather than being killed outright:
// SIGTERM here is forwarded to both children and this script waits for both
// to exit before exiting itself, so a redeploy is a real shutdown, not a
// SIGKILL race.
import { spawn } from "node:child_process";
import path from "node:path";

const GRACE_PERIOD_MS = 8_000;

const services = [
  { name: "api", cwd: "apps/api", entry: "src/server.ts" },
  { name: "worker", cwd: "apps/worker", entry: "src/index.ts" },
];

const children = services.map(({ name, cwd, entry }) => {
  const tsx = path.resolve(cwd, "node_modules", ".bin", "tsx");
  const child = spawn(tsx, [entry], { cwd, stdio: "inherit", env: process.env });
  child.serviceName = name;
  return child;
});

let shuttingDown = false;
let exitCode = 0;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  }
  setTimeout(() => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        console.error(`[docker-start] ${child.serviceName} did not exit within ${GRACE_PERIOD_MS}ms, sending SIGKILL`);
        child.kill("SIGKILL");
      }
    }
  }, GRACE_PERIOD_MS).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

let remaining = children.length;
for (const child of children) {
  child.on("exit", (code, signal) => {
    remaining -= 1;
    console.error(`[docker-start] ${child.serviceName} exited (code=${code}, signal=${signal})`);
    if (!shuttingDown) {
      // One service died on its own: bring the whole container down so
      // Railway's restart policy (railway.toml) restarts api and worker
      // together, rather than leaving one running without the other —
      // the exact split state this script exists to prevent.
      exitCode = code ?? 1;
      shutdown("SIGTERM");
    }
    if (remaining === 0) process.exit(exitCode);
  });
}
