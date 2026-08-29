# Module `workspace` — M6 (today, todos), M7 (pomodoro, music)

## Responsibility

The place the user actually lives: today's activities gathered from every other
module, and a todo list. Workspace **aggregates and owns almost no data**; its
main job is composition.

This is the module most likely to violate boundaries, because everything it shows
belongs to someone else. It reads through public interfaces only.

**This spec predates M5's rewrite of `planning` into `progress`** and referred
throughout to a `PlanEntry` type and a `progress.getToday` call that no longer
exist — the mechanical part of that rename (`from planning` → `from progress`
in a comment) papered over a dead reference instead of fixing it. This rewrite
resolves that properly: see "Why workspace composes, not review" below for
what actually replaces it, and CLAUDE.md/`docs/UI.md`/`review/domain/mastery.ts`/
`apps/web/src/lib/day-boundary.ts` for other leftover `planning` references
fixed alongside this spec.

## Scope note

Only **M6** is designed below: the Today view, todos with CRUD, and todo
extraction from a photo. Pomodoro and Spotify are **M7**, per this module's own
header and `docs/MILESTONES.md` — mentioned only where M6's design must not
foreclose them (e.g. not creating M7's table now), never designed here.

## Domain

```ts
type TodayView = {
  date: string;
  dueCards: { documentId: string; documentTitle: string; colour: string; count: number }[];
  notionsBelowTarget: { documentId: string; documentTitle: string; colour: string; count: number }[];
  todos: Todo[];                  // owned here
  upcomingDeadlines: { documentId: string; title: string; deadlineDate: string; deadlineLabel: string | null; daysAway: number }[];
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
```

`planEntries: PlanEntry[]` from the original draft is gone — `PlanEntry` was
`planning`'s own domain type, deleted along with the rest of that module in
M5 (`docs/MILESTONES.md`'s M5 section). `notionsBelowTarget` replaces it; see
below for where it comes from and why it looks the way it does.

**`daysAway` is a fact, not a warning.** No "plus que 2 jours", no countdown, no
colour escalation as it shrinks. Rendered in `--warning` at most, per
`docs/UI.md`, same rule `progress`'s own screen already follows for its
day-count phrase.

**Empty is a legitimate state, not a failure.** Nothing due today renders the
`idle` mascot (`docs/UI.md`'s poses — this spec's original `sleeping` pose does
not exist among them), a plain statement and one useful suggestion. No guilt
copy, no "tu n'as rien fait".

### Why `workspace` composes, not `review`

`TodayView` needs a source for "what to do today" beyond raw due cards:
specifically, the notions currently below `progress`'s own target trajectory
(`R(notion) < target(now)`, the same selection `progress.behindByNotions`
already counts — `docs/modules/progress.md`). Three ways to get there were
considered:

- **`review.getDueCards` alone.** Zero new coupling, and it is explicitly
  still "the only source of what's due right now" per `progress`'s own Out of
  scope section. But it carries no relationship to a course's deadline
  trajectory at all — a course with a looming exam and nothing FSRS-due today
  (because nothing has ever been reviewed, so nothing has a schedule to be
  "due") would show nothing in `dueCards`, which is exactly the case
  `progress.behindByNotions` exists to describe. Using this alone silently
  drops the one signal `progress` was built to surface.
- **A priority queue inside `review`, reusing `R(notion) < target(now))`.**
  This was `progress.md`'s own original plan (now corrected there, see that
  file) and does not work: `target(now)` needs the deadline and the
  trajectory formula, both of which live in `progress`. `review` importing
  `progress` for that while `progress` already has a real, value-level import
  from `review` (`assemble-progress-notions.ts`'s
  `import { projectRetrievability } from "../../review/index.js"`) closes an
  actual runtime dependency cycle, not a hypothetical one. Today's
  `.dependency-cruiser.cjs` has no rule that would even catch this (no
  `no-circular-dependency` forbidden rule is configured) — which makes this
  option worse, not safer: the mistake would ship silently instead of failing
  loudly in `pnpm lint`. Avoiding the cycle by having `review` receive
  `target` as a parameter (computed by whoever calls it) is not meaningfully
  different from option (c) below, just with the composition step relocated
  into `review` for no benefit.
- **`workspace` composes**, reading due cards from `review` and notions below
  target from a new `progress` read. Acyclic: `workspace → review` and
  `workspace → progress` are both new edges, `review` and `progress` remain
  exactly as coupled to each other as M5 left them. This is also just what
  `workspace` is *for* — its own Responsibility section above already says
  "aggregates... its main job is composition."

**Verdict: option (c).** `progress` gains two new, additive exports,
proposed with their exact signatures in `docs/modules/progress.md` (search
"PROPOSED, for M6") for review before either is implemented, same
discipline M5 used for `getCardSchedulesForDocument`: the pure
`notionsBelowTarget` (domain), and `notionsBelowTargetForDocument`
(application) — which, on review, does **no I/O of its own**: it takes
rows the caller already fetched, exactly like `assembleProgressNotions`
already does. That constraint is not incidental — an earlier draft of this
section proposed a self-fetching, batched `getNotionsBelowTargetForUser`,
and it was wrong the moment `getToday` also needs the deadlines those same
batched reads produce (see Use cases below): two independent calls into
`progress` would each redo the same reads. Making the new export
structurally incapable of doing I/O is what makes that impossible rather
than merely avoided by discipline. It returns membership (which notions),
never an order — `workspace` decides how, or whether, to sequence or group
what it receives; `progress`'s Out of scope rule ("never recommends or
sequences anything") is unchanged by this addition.

### A second, smaller gap: grouping due cards by course

`TodayView.dueCards` groups by `documentId`, but `review.DueCard`
(`review/domain/due-card.ts`) carries `notionId`, not `documentId` — there is
no `documentId` to group by directly. Rather than widen `DueCard`'s shape
(review's own type, a bigger and less obviously safe change), `workspace`
resolves this the same way `progress` already resolves the identical problem
for its own batched reads: call `content.NotionRepository.listNotionsForUser`
(already exported, already used this way by `progress`) to build a
`notionId → documentId` map in memory. No change to `review`'s public
surface, no new coupling point to review before writing — `NotionRepository`
is already `workspace`'s dependency for `notionsBelowTarget` grouping too, so
this is one more use of an injection `workspace` already needs, not a new
one.

## Ports

```ts
interface TodoExtractor {
  extract(input: { bytes: Buffer; today: string }): Promise<Result<TodoExtractionOutput, ExtractionError>>;
}

type ExtractedTodo = { label: string; dueDate: string | null; subject: string | null };
type TodoExtractionOutput = { todos: ExtractedTodo[]; legible: boolean; reason?: string };
```

**`legible`/`reason` added to the output** (not in the original draft, which
returned a bare `ExtractedTodo[]`). Without it, "the photo was too blurry to
read" and "the photo was legible and genuinely has no homework written on
it" are the same observable outcome — an empty array — and the two deserve
different copy ("reprends la photo, elle est trop floue" vs. "aucun devoir
trouvé sur cette photo"). `ingestion.VisionExtractor` already solved this
identical problem for course pages with exactly this shape
(`{ markdown, legible, reason? }`); `TodoExtractor` reuses the same solution
for the same reason, not a new idea. `legible: false` is a success
(`Ok`), never an `ExtractionError` — same rule as `VisionExtractor`'s own
port.

**Use the shared model client from `packages/core/src/shared/`, with its own
prompt and output schema.** `ingestion` does export `VisionExtractor`
(`ingestion/index.ts`) — for its own wiring in `apps/api`/`apps/worker`, not
for reuse — so "do not import it" (the original draft's claim that
`index.ts` does not export adapters) was already inaccurate. The real rule is
narrower and still holds: do not construct or call `ingestion`'s
`VisionExtractor` from here. It has its own schema (`markdown`, `legible`,
`reason`) and prompt built for transcribing a course page, not for
structured todo extraction, and CLAUDE.md rule 3 (every LLM call through its
own port) plus the "no second client wrapper" rule mean `workspace` needs its
own `TodoExtractor` port and its own adapter — following the exact same
shape as `ingestion/infra/vision-extractor.ts` (a `generateObject` call with
its own Zod schema, `createLanguageModel` from `shared`, retry once with the
validation error fed back per CLAUDE.md rule 4), not importing that file.

`today` is passed into `extract()` (added to the port's input, not in the
original draft) because `dueDate` is often relative on a school planner
("mardi"), and the model must resolve that against a specific week — the
Zod schema still takes only a resolved ISO date; the prompt receives
`today` as context so the model sees the surrounding week layout, which
resolving weekday names in post-processing cannot recover.

## Use cases

- `getToday(userId, now)` — composes, in one application function, from
  **six raw reads, each made exactly once**, never through `progress.listProgress`
  (which would silently redo three of them — see `docs/modules/progress.md`):
  - `ingestion.DocumentRepository.listDocuments(userId)` — title and colour
    for every course; `dueCards`, `notionsBelowTarget` and
    `upcomingDeadlines` all need this, so it is fetched once and shared by
    all three, not once per grouping.
  - `content.NotionRepository.listNotionsForUser(userId)` — every notion,
    to build the `notionId → documentId` map `dueCards` needs (see above)
    and as `notionsBelowTargetForDocument`'s own input, grouped by
    `documentId` once in memory the same way `progress.listProgress`
    already groups it internally.
  - `review.ReviewRepository.getDueCards(userId, dayBoundary, {})` — no
    filter, every course. `dayBoundary` from
    `apps/web/src/lib/day-boundary.ts`'s `startOfTomorrowISO`, same
    client-computed rule `review` already uses.
  - `review.ReviewRepository.getCardSchedulesForUser(userId)` — every
    active card's schedule, `notionsBelowTargetForDocument`'s other input.
  - `progress.ProgressRepository.getDeadlinesForUser(userId)` — every
    deadline; feeds both `notionsBelowTargetForDocument` (per document) and
    `upcomingDeadlines` directly (`daysAway` is a plain date subtraction
    against `now`, computed here — no `progress` call needed for that part
    at all).
  - this module's own `TodoRepository.listTodos(userId)`, for `todos`.

  Then, purely in memory, per document: group the second and fourth reads
  above by `documentId`, call `progress.notionsBelowTargetForDocument(notions,
  cardRows, deadline, now)` once per document (pure, no I/O — see
  `docs/modules/progress.md`) to get that document's notion ids, and fold
  everything into `TodayView`. Six reads in total, none of them repeated,
  none of them a loop over `documentRepo.listDocuments` the way
  `progress.listProgress` explicitly avoids, and no direct SQL against
  another module's tables (asserted by `dependency-cruiser`, same as the
  original draft's Key tests intent).
- `createTodo`, `updateTodo`, `deleteTodo`. `updateTodo`'s patch includes
  `done` — checking a todo off is not a separate `toggleTodo` function or
  route. An earlier version of this step split them, and the one
  `PATCH /api/todos/:id` route dispatched on whether the body contained
  `done`, silently dropping any other field sent alongside it: correctness
  depended on the caller never combining them, a convention rather than a
  contract. Fixed by making the route apply every field present, `done`
  included, in one call.
- `handleTodoPhotoJob(payload: { storedPath: string }, ctx)` — reads the
  photo via `fileStore.read`, calls `TodoExtractor.extract` with `ctx.now`
  truncated to a date key as `today`. `legible: false` fails the job with
  `result.value.reason` as `last_error`, same as
  `ingestion.handleExtractionJob`'s identical check. Otherwise replaces
  (never appends to) that job's proposal rows — idempotent per upload, same
  discipline as `ingestion.handleExtractionJob`'s `upsertExtraction`: a
  retry after a worker crash must not duplicate rows, achieved by deleting
  any existing proposal rows for the job before inserting the new batch, in
  one transaction. A legible photo with zero homework on it is a valid
  success with zero proposals, not an error — see "Where the photo itself
  goes" below for why this case still needs to be handled correctly at
  confirm/reject time.
- `confirmProposals(userId, jobId, acceptedIds, now)` /
  `rejectProposals(userId, jobId)` — both keyed on the **job's own
  existence and ownership**, not on whether it has any proposals: `Err
  'not-found'` if `jobId` names no `extract-todos` job belonging to
  `userId` (found via `jobQueue.listJobs(userId, 'extract-todos')`, the
  same lookup `ingestion.retryExtraction`/`getDocument` already use for
  their own job-payload reads — no new `jobs` capability needed). Keying on
  the job rather than the proposals is what makes a legible-but-empty photo
  (zero proposals, a valid outcome above) still confirmable/rejectable —
  keying on "does at least one proposal exist" would leave that photo's
  upload with no cleanup path at all, and `POST .../confirm` is currently
  the only way `docs/modules/workspace.md`'s step 4 screen will have to
  dismiss it.
  - `confirmProposals`: creates a `Todo` (`source: 'photo'`) for each
    accepted id, deletes **every** proposal for the job (accepted or not —
    a proposal the person didn't accept is discarded, not left behind),
    both in one transaction; not a loop calling the manual `createTodo`
    use case, which inserts one row with no matching "delete these
    proposals" step.
  - `rejectProposals`: deletes every proposal for the job, creates no
    todos. Functionally `confirmProposals(..., acceptedIds: [])` would do
    the identical thing at the data layer — kept as a separate, named
    function and route anyway, because "I don't want any of these" and "I
    want some of these" are different intents for the person using the
    screen, even when their storage-layer effect coincides.
  - Both then call the file-cleanup step below, after their own DB
    transaction commits, never inside it (file I/O does not belong in a
    write transaction any more than an LLM call does).

## Persistence

**This milestone (M6) creates two tables.** `pomodoro_sessions` is **not**
created now — it belongs to M7, per this module's own header and
`docs/MILESTONES.md`, and CLAUDE.md's top-level rule against tables for data
no current milestone stores. It ships in a separate, later migration, written
alongside M7's own spec, not this one.

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
```

**Every `REFERENCES` above crosses a module boundary** (`users`, `documents`,
`jobs` are `identity`'s, `ingestion`'s, and `jobs`'s own tables respectively).
CLAUDE.md's SQLite specifics section documents the recurring workaround for
exactly this (already applied for M1 `users`, M2 `jobs`, M2 `documents`,
M5 `deadlines`): omit `.references()` in the Drizzle TS schema, generate the
migration, then hand-edit the generated SQL to add the `REFERENCES` clause.
Apply it here too, for all three columns above, with the same paired comment
in both the schema file and the migration.

Todos extracted from a photo are **proposals**: the extraction job writes them
to `todo_proposals`, never directly to `todos`. The jobs table stores no
results, so this table IS the job's output. Confirming copies the accepted rows
into `todos` and deletes the proposal set; rejecting deletes it. One bad OCR
pass therefore never silently fills someone's todo list with nonsense.

### Where the photo itself goes, and when it leaves

Not addressed by the original draft at all. `jobs.payload_json` is a small
JSON column (`packages/core/src/jobs/infra/schema.ts`) — every existing job
payload is an id or two, never raw bytes (`ingestion.ExtractDocumentPayload`
is `{ documentId }`); a multi-hundred-KB photo does not belong there.
`ingestion` already owns exactly this problem and already exports the
answer: `FileStore`/`LocalFileStore` (`ingestion/index.ts`). `workspace`
takes a `FileStore` dependency (the same shared instance `apps/api`/
`apps/worker` already construct for `ingestion`) and writes the upload to
`DATA_DIR/uploads/{userId}/{uploadId}/0.{ext}` — reusing
`FileStore.put(userId, documentId, pageIndex, bytes, ext)` completely
unmodified, an id where it normally takes a `documentId` and page index
always `0` (one photo per job). CLAUDE.md's Files section documents this
exact path. `handleTodoPhotoJob`'s payload is then just `{ storedPath }`,
not the bytes. No `documents` row is created — there is no course here, no
page ordering, no SHA-256 dedup: a planner photo is a one-shot job input,
not a document.

**`uploadId`, not `jobId` — found while implementing, not in any earlier
draft of this spec.** `JobQueue.enqueue` (a frozen kernel) generates the
job's id internally and only returns it once the row already exists, so
`startTodoPhotoExtraction` cannot know the job's id before the file is
written and cannot name the path after it. It generates its own id from the
same `IdGenerator` for the path, writes the file, then enqueues the job
(which gets a separate id of its own) with that path in its payload.

**No `documents` row means no lifecycle for this file by default** — unlike
a course's pages, nothing's deletion carries this one away, and it would
sit on the Railway volume forever. Two ways to close that, no implicit
third:

1. Delete it once its job's proposals are confirmed or rejected — the
   natural end of its usefulness, since the spec already deletes the
   proposal set at that exact moment.
2. Accept indefinite retention, documented as a debt with its reason.

**Decision: (1).** The file exists to feed exactly one extraction; once its
proposals are confirmed (copied into `todos`) or rejected (discarded),
nothing will ever read it again, and a small deployment ("a handful of
users," CLAUDE.md) accumulating one abandoned photo per upload forever is a
real, unbounded leak with no cleanup path at all — not a deferred nice-to-have.

**How, without a new table or a per-proposal column.** The natural place to
store `storedPath` for later deletion would be `todo_proposals` itself, but
that fails the moment a legible photo has zero homework on it (see
`handleTodoPhotoJob` above): zero proposal rows means nowhere to have
stored it. The job row itself has no such gap — it exists the moment the
photo is uploaded and is never deleted (`docs/modules/jobs.md`) — so
`confirmProposals`/`rejectProposals` read `storedPath` back off the job's
own payload via `jobQueue.listJobs(userId, 'extract-todos')`, the exact
pattern `ingestion.retryExtraction`/`getDocument`/`list-documents` already
use to read their own job payloads back. No new table, no denormalized
column repeated across a job's proposal rows, and it works identically
whether the job produced zero proposals or several.

**Both paths are tested, and neither fails on an already-deleted file.**
`FileStore.delete` (`LocalFileStore`) already calls Node's `rm` with
`force: true` — a missing file is a no-op there, not an error — so
`confirmProposals`/`rejectProposals` call it unconditionally, after their
own DB transaction commits, with no extra existence check of their own.
This also covers a retried confirm/reject (the file gone from the first
attempt, `not-found` from the DB half is impossible since the job/proposals
were already handled — see the transaction ordering above) without a
special case.

**Known, narrower gap, disclosed rather than left implicit: a permanently
failed job's photo is not cleaned up.** If `TodoExtractor.extract` reports
`legible: false`, or the job exhausts its retries, `handleTodoPhotoJob`
never reaches the success path, so no confirm/reject ever happens for it,
and the file is never deleted by this mechanism. This mirrors, not
contradicts, `ingestion`'s own precedent: a permanently failed extraction
there doesn't auto-delete its pages either — only an explicit terminal
action does (there, `deleteDocument`; here, there is no equivalent for a
failed photo upload in this milestone, since there is no `documents`-like
row to attach a "delete this failed upload" action to). Smaller and more
defensible than blanket retention, but real — not silently traded away.

## API

| Route | Purpose |
|---|---|
| `GET /api/today` | The composed view |
| `POST /api/todos` · `PATCH /api/todos/:id` · `DELETE /api/todos/:id` | CRUD |
| `POST /api/todos/from-photo` | Multipart, writes the photo via `FileStore`, enqueues extraction |
| `GET /api/todos/proposals/:jobId` | Proposals awaiting confirmation |
| `POST /api/todos/proposals/:jobId/confirm` | `{ accepted: [...] }` |
| `POST /api/todos/proposals/:jobId/reject` | No body |

**`reject` is missing from the original draft's table entirely**, even
though its own prose two paragraphs above it says "rejecting deletes it" —
a real gap, not a rename. Added here.

Pomodoro's two routes from the original draft (`POST /api/pomodoro` ·
`PATCH /api/pomodoro/:id`) move to M7's own spec — not built, not routed,
not tested this milestone.

## Out of scope

Notifications and reminders, which need push infrastructure. Calendar sync.
Anything that generates content. Pomodoro and Spotify (M7, see Scope note
above).

## Key tests

- **Integration, written first: proposals are never written to `todos`
  before confirmation.** The central invariant of the photo-extraction
  step — everything else in that step exists to protect it.
- Integration: `confirmProposals` deletes the photo file and rejects a
  retry safely — asserted for both the confirm and the reject path, and
  again against a file already deleted (a second call must not fail)
- Unit: `TodayView` composition with empty inputs, a full day, and a mix
- Unit: `daysAway` at 0, 1 and negative
- Contract: planner-photo fixture yields todos with resolved dates; an
  illegible fixture returns a clear reason; a legible-but-empty photo
  succeeds with zero proposals, not an error
- Integration: `getToday` makes no direct SQL query against another module's
  tables (asserted via `dependency-cruiser`)
- Integration: `getToday`'s grouping by `documentId` does not cross-contaminate
  between two courses — same failure mode and same test shape
  `progress.listProgress` already has a dedicated test for
  (`docs/modules/progress.md`), applied here to `dueCards` and
  `notionsBelowTarget` grouping
- Playwright: photo of a planner to a confirmed, ticked todo

## Open questions

- Should todos extracted from a photo be linked to a course automatically by
  matching the subject name? Tempting, wrong when it guesses badly. Currently the
  extractor returns `subject` as a hint and the user links manually.
