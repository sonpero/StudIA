import { heartbeatMessage } from "./heartbeat.js";

// No jobs table exists yet — the polling loop lands with the jobs module (M2, see docs/MILESTONES.md).
console.log(heartbeatMessage(new Date()));
setInterval(() => {
  console.log(heartbeatMessage(new Date()));
}, 60_000);
