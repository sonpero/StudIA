# Module `workspace` — M6 (today, todos), M7 (pomodoro, music)

## Responsibility

The place the user actually lives: today's activities gathered from every other
module, a todo list, and focus tools. Workspace **aggregates and owns almost no
data**; its main job is composition.

This is the module most likely to violate boundaries, because everything it shows
belongs to someone else. It reads through public interfaces only.

## Domain

```ts
type TodayView = {
  date: string;
  dueCards: { documentId: string; documentTitle: string; colour: string; count: number }[];
  planEntries: PlanEntry[];       // from planning
  todos: Todo[];                  // owned here
  upcomingDeadlines: { documentId: string; label: string; date: string; daysAway: number }[];
};

type Todo = {
  id: string;
  userId: string;
  label: string;
  dueDate: string | null;
  documentId: string | null;      // optional link to a course
  done: boolean;
  source: 'manual' | 'photo';
  createdAt: string;
};

type PomodoroSession = {
  id: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  workMinutes: number;
  documentId: string | null;
};
```

**`daysAway` is a fact, not a warning.** No "plus que 2 jours", no countdown, no
colour escalation as it shrinks. Rendered in `--warning` at most, per
`docs/UI.md`.

**Empty is a legitimate state, not a failure.** Nothing due today renders the
`sleeping` mascot, a plain statement and one useful suggestion. No guilt copy,
no "tu n'as rien fait".

## Ports

```ts
interface TodoExtractor {
  extract(input: { bytes: Buffer }): Promise<Result<ExtractedTodo[], ExtractionError>>;
}

type ExtractedTodo = { label: string; dueDate: string | null; subject: string | null };
```

**Use the shared model client from `packages/core/src/shared/`, with its own
prompt and output schema.** Do not import `ingestion`'s adapter: adapters are
module-internal and `index.ts` does not export them. Do not add a second AI
dependency or a second client wrapper either; if the shared client is missing
something, say so rather than duplicating.

Zod notes: `dueDate` is often relative on a school planner ("mardi"), so the
schema takes a resolved ISO date and the prompt receives today's date as context.
Resolving weekday names to dates happens in the **prompt input**, not in
post-processing, because the model sees the surrounding week layout and you do not.

## Use cases

- `getToday(userId, now)` — composes from `review.getDueCards`,
  `planning.getToday`, and local todos. One call per module, no SQL against
  another module's tables.
- `createTodo`, `updateTodo`, `toggleTodo`, `deleteTodo`
- `handleTodoPhotoJob(payload, ctx)` — extract todos from a planner photo,
  idempotent per upload
- `startPomodoro(userId, documentId, workMinutes, now)`, `endPomodoro`

**Pomodoro is a preference, not a rule.** Default 25/5, fully configurable
including "no break", and never auto-started. Nothing in the app requires a
pomodoro to review.

**Timer state survives reload**: persist `startedAt` and compute remaining time
from it. Never hold the countdown only in React state.

## Persistence

```sql
CREATE TABLE todos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  label TEXT NOT NULL,
  due_date TEXT,
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  done INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL CHECK (source IN ('manual','photo')),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_todos_user ON todos(user_id, done, due_date);

CREATE TABLE todo_proposals (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  label TEXT NOT NULL,
  due_date TEXT,
  subject_hint TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_proposals_job ON todo_proposals(job_id);

CREATE TABLE pomodoro_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  work_minutes INTEGER NOT NULL
);
```

Todos extracted from a photo are **proposals**: the extraction job writes them
to `todo_proposals`, never directly to `todos`. The jobs table stores no
results, so this table IS the job's output. Confirming copies the accepted rows
into `todos` and deletes the proposal set; rejecting deletes it. One bad OCR
pass therefore never silently fills someone's todo list with nonsense.

## API

| Route | Purpose |
|---|---|
| `GET /api/today` | The composed view |
| `POST /api/todos` · `PATCH /api/todos/:id` · `DELETE /api/todos/:id` | CRUD |
| `POST /api/todos/from-photo` | Multipart, enqueues extraction |
| `GET /api/todos/proposals/:jobId` | Proposals awaiting confirmation |
| `POST /api/todos/proposals/:jobId/confirm` | `{ accepted: [...] }` |
| `POST /api/pomodoro` · `PATCH /api/pomodoro/:id` | Start, end |

## Music

Spotify is an **embedded playlist iframe**, nothing more. No OAuth, no Web
Playback SDK, no Premium requirement, no playback control from the app. The user
pastes a playlist URL in settings and it renders in a collapsible panel.

The full integration needs a Premium account and an OAuth flow, which is a
disproportionate amount of work and a hard dependency on a paid tier for a focus
aid. Revisit only if the embed proves genuinely inadequate.

## Out of scope

Notifications and reminders, which need push infrastructure. Calendar sync.
Anything that generates content.

## Key tests

- Unit: `TodayView` composition with empty inputs, a full day, and a mix
- Unit: `daysAway` at 0, 1 and negative
- Unit: pomodoro remaining time computed from `startedAt`, not from a tick counter
- Contract: planner-photo fixture yields todos with resolved dates; an illegible
  fixture returns a clear reason
- Integration: proposals are not written to `todos` until confirmed
- Integration: `getToday` makes no direct SQL query against another module's
  tables (assert via `dependency-cruiser`)
- Playwright: photo of a planner to a confirmed, ticked todo; pomodoro survives a
  page reload

## Open questions

- Should todos extracted from a photo be linked to a course automatically by
  matching the subject name? Tempting, wrong when it guesses badly. Currently the
  extractor returns `subject` as a hint and the user links manually.
