# Module `jobs` — M2 · FROZEN

## Responsibility

A durable job queue backed by the `jobs` table, plus the worker loop that drains
it. Owned by no feature module; used by `ingestion`, `generation` and `tutor`.

**This module is frozen.** Changing it means changing the contract every other
module depends on. Propose changes to the human; do not edit it in a worktree.

## Domain

```ts
type JobStatus = 'pending' | 'running' | 'done' | 'failed';

type Job = {
  id: string;
  userId: string;
  type: string;            // e.g. 'extract-document'
  payload: unknown;        // validated by the handler's Zod schema
  status: JobStatus;
  attempts: number;
  maxAttempts: number;     // default 3
  lastError: string | null;
  runAfter: string;        // ISO, enables backoff
  createdAt: string;
  updatedAt: string;
};
```

**State machine.** The only legal transitions:

```
pending  -> running
running  -> done
running  -> pending   (retry, attempts < maxAttempts, runAfter pushed back)
running  -> failed    (attempts >= maxAttempts)
running  -> pending   (startup recovery)
```

Anything else is a bug. This is a pure function and it is tested exhaustively.

**Backoff.** `runAfter = now + 2^attempts * 30s`, capped at 15 minutes. Pure
function of `(attempts, now)`.

## Ports

```ts
interface JobHandler<T> {
  type: string;
  payloadSchema: ZodSchema<T>;
  handle(payload: T, ctx: JobContext): Promise<Result<void, JobError>>;
}

type JobContext = { jobId: string; userId: string; attempt: number; now: Date };

interface JobQueue {
  enqueue(userId: string, type: string, payload: unknown, now: Date): Promise<string>;
  claimNext(now: Date): Promise<Job | null>;
  complete(jobId: string, now: Date): Promise<void>;
  fail(jobId: string, error: string, now: Date, options?: { terminal?: boolean }): Promise<void>;
  recoverStale(now: Date): Promise<number>;
  listJobs(userId: string, type: string, createdAfter?: string): Promise<Pick<Job, 'id' | 'status' | 'payload' | 'lastError'>[]>;
}
```

**`fail()`'s `terminal` option.** Normally `fail()` increments `attempts` and compares
it to `maxAttempts`: below the limit, the job goes `running -> pending` with a
backed-off `runAfter`; at or above it, `running -> failed`. `terminal: true`
skips that comparison entirely and goes straight to `running -> failed` with
the given error, regardless of `attempts`. It exists for exactly one caller:
the worker dispatching a job whose `type` has no registered handler. That is a
worker configuration problem, not a transient failure — retrying it would
just repeat the same outcome after real backoff delays, contradicting "fails
immediately... rather than looping". Since `enqueue()` has no way to set a
per-job `maxAttempts` (it is always the schema default, 3) and there is no
`now`-independent way to force immediate exhaustion through the normal path,
`terminal` is the minimal, spec-compliant fix: one optional parameter on an
existing method rather than a new one.

`listJobs` is the read side: owning modules use it to report progress (for
example `generation`'s `{ done, total, failed }` counts, filtered by
`payload.documentId`). It is read-only and never a substitute for a module
storing its own state.

Handlers register themselves at worker startup. A job whose `type` has no
registered handler fails immediately with a clear error rather than looping.

## Use cases

- `enqueueJob` — write a `pending` row. Callers never write to the table directly.
- `runWorkerLoop` — poll, claim, dispatch, record outcome. Interval 1s, backing
  off to 5s when the queue is empty.
- `recoverStaleJobs` — **runs once at worker startup**, resets every `running`
  row to `pending`. A Railway redeploy mid-job would otherwise orphan it.

## Persistence

```sql
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','running','done','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  run_after TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_jobs_claim ON jobs(status, run_after);
CREATE INDEX idx_jobs_user ON jobs(user_id, type, created_at DESC);
```

`claimNext` is a single transaction: select the oldest eligible `pending` row and
flip it to `running`. SQLite serialises writers, so this is safe without
additional locking, but the claim must not span any await other than the DB call.

## API

None. Job status is exposed by the owning module (`GET /api/documents/:id`
returns the extraction status), not by a generic jobs endpoint.

## Out of scope

Cron and scheduled jobs. Priorities. Fan-out and job dependencies. Add them only
when a milestone requires them.

## Key tests

- Every legal transition, and rejection of every illegal one
- Backoff schedule is exact for attempts 0 through 5
- `recoverStale` resets `running` rows and leaves `done` and `failed` untouched
- **Kill the worker mid-handler, restart it, the job runs again and exactly one
  set of rows exists.** This is the M2 acceptance criterion and the reason
  handlers must be idempotent.
- A job with an unregistered type calls `fail()` with `{ terminal: true }`
  exactly once, and the job goes straight to `failed` regardless of
  `attempts` — not through the normal retry/backoff cycle

## Open questions

None. Ask before changing anything here.
