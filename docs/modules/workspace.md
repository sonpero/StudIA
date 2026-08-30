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
`sleeping` mascot (`docs/UI.md`'s poses — this spec's original note said
`idle` because `sleeping` did not exist yet as a component; it does now, and
the Aujourd'hui reprise (`docs/UI.md`) switched the screen to it), a plain
statement and one useful suggestion. No guilt copy, no "tu n'as rien fait".

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

### Calendar — a new composed read

**Built: the query, the pure filter, the composing function (each
mutation-tested), the route, and the CalendarScreen it feeds.** This
section is kept as the record of what was decided and why, same
discipline as `notionsBelowTarget`'s own proposal
(`docs/modules/progress.md`, search "PROPOSED, for M6"): written up before
being implemented, kept here afterward as the record of what was decided
and why, updated where the code ended up different from the first draft
(the shape below did, twice — see "Grouped by day" below).

```ts
type CalendarEntry = {
  kind: 'deadline' | 'todo';
  id: string;                 // the deadline's or todo's own id
  title: string;
  documentId: string | null;  // null only for a todo with no linked course
  colour: string | null;      // the course's subject colour; null for a course-less todo
  done: boolean | null;       // todos only; null for a deadline — no such concept there
};

type CalendarDay = {
  date: string;                // ISO date key, YYYY-MM-DD
  entries: CalendarEntry[];    // every entry on this date, deadlines first, uncapped
};

type CalendarView = {
  start: string;
  end: string;
  days: CalendarDay[];         // one per date with >=1 entry; a date with nothing is absent, not present empty
};
```

**Grouped by day, not the flat array this section originally proposed.**
The first draft argued for one flat `entries: CalendarEntry[]` on the
grounds that `TodayView`'s separate per-kind arrays are exactly what made
Aujourd'hui show the same course three times before its own reprise
(`docs/UI.md`) merged them client-side — true, but beside the point once
the actual requirement was named: the day-cell density rule
(`docs/UI.md`'s Calendrier note — three dots, or two dots plus a count)
has to apply to a day's entries with no regrouping or resorting on the
screen side. A flat array would still make every consumer re-derive "which
entries share this date" before it could apply that rule at all — the same
mistake the flat-array argument was trying to avoid, just moved from
"which course" to "which day." Grouping once, here, in `buildCalendarView`
(`workspace/domain/calendar.ts`), is what actually avoids it: the screen
looks up a date, gets its (already deadline-first, already complete)
`entries`, and applies the density rule directly.

**Order is a contract, not an accident: within a day, every deadline
entry before every todo entry.** `buildCalendarView` folds every deadline
in fully before folding in any todo, so this follows from iteration order
alone — no sort step to get the key wrong. A day cell only has room for
two dots before it must fall back to a count; it reads `day.entries[0]`
and `day.entries[1]` for those two, and `day.entries.length` for the
count, with nothing to reorder or regroup first. Moving that guarantee
into the UI would make the same correctness depend on every future reader
of `days` re-deriving it; put once, here, it can't drift. Named test in
"Key tests" below.

**Port.** One new method on this module's own `TodoRepository`
(`workspace/domain/ports.ts`) — `progress`'s port does not change at all:

```ts
getTodosForUserInRange(userId: string, start: string, end: string): Promise<Todo[]>;
```

A real SQL range read (`WHERE user_id = ? AND due_date BETWEEN ? AND ?`,
both bounds inclusive) — unlike the deadline side below. `todos` has no
natural cap the way one-deadline-per-course does, and the table's own
index (`idx_todos_user`, on `(user_id, done, due_date)`) already
anticipates exactly this access pattern; nothing had used the `due_date`
part of it before this.

**A todo with `dueDate: null` is excluded from the range — a decision,
not the operator's side effect.** SQL `BETWEEN` already drops `NULL` on
its own (`NULL BETWEEN x AND y` evaluates to `NULL`, not true), which is
exactly the risk: the right behaviour and an accident look identical until
someone asks whether it was on purpose. It is: a todo with no date has
nowhere on a grid to go. It is *not*, for that reason, dropped from the
app anywhere else — `getToday`'s own `todoRepo.listTodos(userId)` is a
separate, already-existing, unfiltered read, and a date-less todo keeps
showing on Aujourd'hui exactly as it does today. This read simply never
claims it for a day. "Key tests" below names the test that makes this
explicit rather than incidental.

**Filter.** `filterDeadlinesInRange(deadlines, start, end)` —
`workspace/domain/calendar.ts`, pure, no I/O — must use the exact same
inclusive bounds as the todos query above. Two different boundary
conventions in the same view would shift a deadline by a day relative to
a todo, invisible except exactly on a boundary. Deadlines have no
null-date analogue to the todos query's fifth case (`deadlines.date` is
`NOT NULL`): the fifth test here is selective filtering across more than
one deadline instead — not exercised by any single boundary case alone,
and the actual thing that would go wrong if this were, say, an
accidental `.filter(() => true)`.

**`getDeadlinesForUser` stays unmodified — reading every deadline the
user has and filtering in memory here is the right amount of
engineering, not a shortcut.** The table this reads from holds at most
one row per course (`deadlines_document_unique`); a genuinely small table
does not need a second SQL query shape just to look consistent with the
todos side, which has no such cap.

**Application.** `getCalendar(deps, userId, start, end)`, in
`workspace/application/get-calendar.ts` — same shape as `getToday`, three
reads, then the pure filter and grouping:

- `todoRepo.getTodosForUserInRange(userId, start, end)` (new, above).
- `progressRepo.getDeadlinesForUser(userId)` (existing, unmodified),
  passed through `filterDeadlinesInRange`.
- `documentRepo.listDocuments(userId)` (existing, unmodified) — course
  titles and colours, the same read `getToday` already makes for the same
  reason.
- `buildCalendarView(deadlinesInRange, todos, courses, start, end)`
  assembles the result.

**Bounds are inclusive on both ends, and that is exactly where this gets
wrong if untested.** `start`/`end` are ISO date keys, client-computed (the
displayed month's first and last day) the same way `today`/`dayBoundary`
already are — the server never guesses a month. "Key tests" below is
explicit about the boundary cases this needs, not just "a range works."

**Route.** `GET /api/calendar?start=...&end=...`, not a
widened `GET /api/today`. `TodayView`'s whole contract is "today, plus
deadlines not yet past" — a fixed point, no month-to-month navigation
shape at all. Bending it to also carry an arbitrary browsed range would
make one type answer two unrelated questions ("what do I do now" vs.
"what's on this calendar page"), the same category error `docs/UI.md`'s
Aujourd'hui note already refuses between course cards and the course
catalogue.

**Regime.** `getTodosForUserInRange` and `filterDeadlinesInRange` both
carry a real invariant (correct bounds, correct user scoping) —
reinforced mutation testing, same bucket `notionsBelowTargetForDocument`
is already in (`CLAUDE.md`'s mutation-testing regime split). Within
`buildCalendarView`, the deadline-before-todo ordering and the
course-less-todo colour rule carry an invariant too and are mutation-tested
the same way; the rest of it (grouping, echoing `start`/`end`) is
ordinary composition. `getCalendar` itself, the route, and the screen
stay normal regime — same reasoning `getToday` was never mutation-tested
itself even though pieces it calls are.

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

**Assumed limitation, same category as `progress.md`'s for
`listNotionsForUser`/`getCardSchedulesForUser`, not previously stated here:**
`jobQueue.listJobs(userId, 'extract-todos')` returns every `extract-todos`
job the user has ever created, unpaginated, and `findTodoPhotoUpload` scans
that whole list to find one by id — on every `getProposals`, `confirmProposals`,
and `rejectProposals` call. `listTodos` is the same shape, once over. Both
are fine at "a handful of users" (CLAUDE.md), each uploading occasionally —
this stops being true once a single user's history of planner-photo uploads
grows large, at which point this needs a real lookup (indexed by id, not a
linear scan of everything), not copying this pattern as-is into the next
module that wants "read a job back."

**Both paths are tested, and neither fails on an already-deleted file.**
`FileStore.delete` (`LocalFileStore`) already calls Node's `rm` with
`force: true` — a missing file is a no-op there, not an error — so
`confirmProposals`/`rejectProposals` call it unconditionally, after their
own DB transaction commits, with no extra existence check of their own.
This also covers a retried confirm/reject (the file gone from the first
attempt, `not-found` from the DB half is impossible since the job/proposals
were already handled — see the transaction ordering above) without a
special case.

**Narrower than first thought — revised in step 4.** An earlier draft of
this section treated a permanently failed job's photo as uncleanable by
this mechanism: no confirm/reject would ever happen for it, so no
cleanup. That assumed the confirmation screen (step 4) would have nothing
to call for a failed job. It does: `confirmProposals`/`rejectProposals`
are keyed on the **job's** existence, not on its status or on having any
proposals (see above) — a `failed` job still has a job row, so
`rejectProposals` (wired to the screen's "Fermer" action on the failure
state, `docs/UI.md`'s error-state pattern) still finds it, still deletes
its (zero) proposals, and still deletes its file. **The gap is real only
if the person never opens or dismisses the failed job's screen** — closing
the tab immediately, or a job that fails without the person ever coming
back to check on it. Smaller still than the version this replaces, and
now stated precisely rather than as a blanket "failed jobs leak," which
was not quite true once the screen exists to dismiss them from.

## API

| Route | Purpose |
|---|---|
| `GET /api/today` | The composed view |
| `GET /api/calendar?start=...&end=...` | The composed calendar view (Calendar section above) |
| `POST /api/todos` · `PATCH /api/todos/:id` · `DELETE /api/todos/:id` | CRUD |
| `POST /api/todos/from-photo` | Multipart, writes the photo via `FileStore`, enqueues extraction |
| `GET /api/todos/proposals/:jobId` | `{ status, lastError, proposals }` — see below |
| `POST /api/todos/proposals/:jobId/confirm` | `{ accepted: [...] }` |
| `POST /api/todos/proposals/:jobId/reject` | No body |

**`reject` is missing from the original draft's table entirely**, even
though its own prose two paragraphs above it says "rejecting deletes it" —
a real gap, not a rename. Added here.

**`GET`'s response carries the job's `status` and `lastError`, not just the
proposal array — found missing while building step 4's confirmation
screen, not in any earlier draft.** A bare `TodoProposal[]` cannot
distinguish three states that all look like "empty": still extracting
(`pending`/`running`), extracted with genuinely nothing found (`done`,
empty — a valid, non-error outcome per this module's Domain section), and
failed (needs `lastError`'s human-readable reason, e.g. "La photo est trop
floue pour être lue.", never a raw code). The confirmation screen cannot
render its required states — "extraction in progress," "nothing found,"
"failed with a reason" — without this. Every field the screen needs comes
from a single call: no separate "job status" endpoint.

Pomodoro's two routes from the original draft (`POST /api/pomodoro` ·
`PATCH /api/pomodoro/:id`) move to M7's own spec — not built, not routed,
not tested this milestone.

## UI

**TodayScreen.** Loading (skeleton), error (`confused` mascot, retry), empty
(`idle` mascot, invite — but the photo-upload input is still present, since
"nothing due" is not a reason to hide the one way to add something), ready.
Todos are rendered with a real checkbox (`PATCH .../:id`, invalidating the
view on success) — the read-only rendering from step 2 was a disclosed,
temporary simplification pending this step, not a permanent design.

**ProposalsScreen — where the milestone's central invariant becomes
visible.** The person sees proposals, accepts some, and confirming is the
only thing that writes to `todos`; the screen's whole job is to make that
legible, not just enforce it server-side. Four states, all driven by one
`GET .../proposals/:jobId` poll (`status`/`lastError`/`proposals`, see API
above):

- **Still extracting** (`pending`/`running`): a plain in-progress message,
  polled every 1.5s (matching `NotionsScreen`'s own generation-status poll
  interval) until the job settles — never confused with the other three
  states, which is exactly why `GET` needed `status` in the first place.
- **Done, zero proposals**: `idle` mascot, "Aucun devoir trouvé sur cette
  photo." — a legitimate result (a legible photo can genuinely have nothing
  on it), never presented as a problem or a bare `0`. A "Fermer" button
  calls `rejectProposals`, which is also what cleans up the file for this
  case (see "Where the photo itself goes" above).
- **Failed**: `confused` mascot, the job's own `lastError` verbatim (e.g.
  "La photo est trop floue pour être lue.") — never a raw error code, never
  a generic "something went wrong." "Fermer" calls `rejectProposals` here
  too, which is what actually closes the file-cleanup gap noted above, for
  whoever clicks it.
- **Ready**: one row per proposal, checked by default (the common case is a
  correctly read photo; unchecking a wrong one is lighter than checking
  every right one). Each row shows `label`, `dueDate` (or "sans échéance
  indiquée"), and `subjectHint` as **plain text next to the label, never a
  course-selection control** — matching this module's own Open question
  below: subject is a hint, linking to a course is a manual, separate
  action the person takes afterward, not something this screen guesses at.
  "Confirmer la sélection" sends exactly the checked ids; "Tout rejeter" is
  a second, explicit action for "none of these," not a side effect of
  unchecking everything and confirming (see `rejectProposals`'s own
  comment for why these stay two functions). No mascot here — a list of
  proposals to review is data-dense, `docs/UI.md`'s rule for `ProgressScreen`
  and `TodayScreen`'s own ready states applies the same way here.

## Out of scope

Notifications and reminders, which need push infrastructure. **Calendar
sync** — pushing StudIA's dates out to Google Calendar, iCal, or any other
external calendar, still excluded, still needs its own integration and
its own consent flow. The in-app, read-only Calendrier screen (the
Calendar section above) is a different thing entirely — nothing leaves
this app — and was never what this line meant to exclude; restated so it
isn't cited to reopen a settled question. Anything that generates content.
Pomodoro and Spotify (M7, see Scope note above).

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
- Unit: `getProposals` returns `status`/`lastError` distinctly for
  still-extracting, done-empty, and failed — all three otherwise look like
  the same empty array
- Component: `ProposalsScreen`'s four states (still extracting, done-empty,
  failed with the reason, ready with checkboxes default-checked); subject
  shown as text, never a `combobox`/course-selection control; confirming
  sends only the checked ids
- Component: `TodayScreen`'s todo checkbox sends exactly `{ done: true }`
  for the toggled todo, no others
- Playwright (`e2e/todo-photo.spec.ts`): photo of a planner to a confirmed,
  ticked todo, checked twice — that the unaccepted proposal never becomes a
  todo, and that the tick survives a reload (persisted, not local state)

**Calendar.** Data-layer boundaries named individually, not "a range
works," each proven by a targeted mutation run and reverted
(`sqlite-todo-repository.int.test.ts`, `workspace/domain/calendar.unit.test.ts`):
- `getTodosForUserInRange`: a todo dated exactly `start` is included; a
  todo dated exactly `end` is included; a todo dated one day before
  `start` is excluded; a todo dated one day after `end` is excluded; a
  todo with `dueDate: null` is excluded — named separately from the four
  boundary cases so it reads as a decision, not a fifth boundary; and a
  todo dated the same day as two others sorts by `dueDate` then
  `createdAt` (this last one caught a real bug in its own first draft: it
  used identical `createdAt` values across all three seeded rows and
  passed by id-order coincidence, not by exercising the sort at all —
  rewritten with distinct timestamps and ids chosen to *not* match either
  alphabetical or insertion order before it was trusted)
- `filterDeadlinesInRange`: the same four boundary cases, against a
  deadline's `date` instead of a todo's `dueDate` — same failure shape,
  different table, both need their own proof. **No fifth, null-shaped
  case: `deadlines.date` is `NOT NULL`, so there is nothing here for that
  case to be about.** Its place is taken by a genuinely different
  property — of several deadlines, only the ones inside the range survive
  — which none of the four boundary cases alone exercises (an accidental
  `.filter(() => true)` passes all four of those and fails only this one)
- Unit: `getTodosForUserInRange`'s own scoping (another user's todo in
  the same range never appears) and `filterDeadlinesInRange`'s equivalent
  are proven at their own layer; `getCalendar`'s unit tests re-prove the
  composition — another user's deadline *and* todo, dated inside the same
  range, both absent from the result — without re-testing the boundary
  logic those layers already own
- Unit: `buildCalendarView` — a day carrying one deadline and three todos
  lists the deadline first, the exact case a busy day breaks a calendar
  grid with; a course-less todo (`documentId: null`) produces a
  `CalendarEntry` with `colour: null`, never a guessed or default colour;
  a course-linked todo keeps its own label as `title`, never the course's
  title; a date with nothing is absent from `days` entirely, never
  present with an empty `entries` array
- Unit: `getCalendar` excludes a deadline outside the browsed range even
  though `getDeadlinesForUser` itself returns every deadline the user has
  ever set — the property that makes `filterDeadlinesInRange` load-bearing
  rather than decorative

**`CalendarScreen` (`apps/web/src/screens/CalendarScreen.unit.test.tsx`,
17 tests, normal regime — no mutation ritual for screen code):**
- A day cell's colour never changes based on how far away it is or
  whether its date has passed — no assertion is skipped here just
  because it is a "the app does nothing" test; the whole point of the
  colour rule is what it forbids
- A day with 4 entries renders 2 dots and "+2", not 4 dots and not "+4";
  a day with exactly 3 entries renders 3 dots, no badge — the boundary
  the overflow rule turns on
- A course-less dot is named "Todo sans cours"; a course-linked dot is
  named after the course, resolved from `listDocuments` (the same read
  `TodayScreen`'s own add-form already makes) — not the todo's own label,
  which has nowhere to print at dot size (`docs/UI.md`'s Calendrier note)
- Today's cell carries `aria-current="date"`, and only today's
- Leading/trailing filler days from adjacent months render (so every row
  is a complete week) but are not buttons — not fetched for, so making
  them clickable would show a selection that always reads as empty
  regardless of what that day actually holds
- "Mois suivant"/"Mois précédent" fetch the **displayed** month's bounds,
  proven by asserting on the actual request URLs across multiple clicks,
  not just the resulting heading text — including a case that crosses a
  year boundary (January → December of the previous year)
- No day selected shows a neutral prompt; selecting an empty day shows
  "Rien ce jour-là" — neither is a blank panel
- Selecting a busy day shows every entry uncapped, deadline order first;
  a deadline's "Voir le cours" calls back with its `documentId`; a todo
  has nothing to click and a done one renders struck through
- No `role="dialog"` at any point in this flow (`docs/UI.md`'s Forbidden
  list: no modals here)

## Open questions

- Should todos extracted from a photo be linked to a course automatically by
  matching the subject name? Tempting, wrong when it guesses badly. Currently the
  extractor returns `subject` as a hint and the user links manually — unchanged
  through all four steps of this milestone; the temptation to auto-link was not
  taken anywhere in the implementation either.

## Process

Test-first throughout all four steps, prospective, with exactly one
disclosed exception: `claude-todo-extractor.contract.test.ts` and
`fixture-todo-extractor.unit.test.ts` (step 3) were written and run after
their adapters already existed, not before — verified correct once
written, not prospectively red first. Every other file across all four
steps — the repository, every application-layer function, every route, the
domain exports, `TodayScreen`, `ProposalsScreen` — was written test-first
and run to a confirmed failure (missing module, 404, or a wrong number
worked out by hand) before its implementation existed. Three real defects
were found and fixed while implementing rather than being caught in
review: `JobQueue.enqueue`'s id can't be known before the file it names
must already exist (`uploadId`, not `jobId`), a barrel collision on
`ExtractionError` (renamed `TodoExtractionError`), and a genuine false
positive in `workspace-no-cross-module-sql` once it met workspace's own
LLM adapters (excluded `shared`/`jobs`, the frozen kernels, from its `to`).
A fourth was found while building step 4 rather than earlier: `getProposals`
returning a bare array could not distinguish "still extracting" from "done,
empty" from "failed," which the confirmation screen needed to render
correctly — fixed before the screen was built on top of it, not after.

## Known debts

- **A permanently failed job's photo is cleaned up only if the person
  opens and dismisses its confirmation screen** (see "Where the photo
  itself goes, and when it leaves"). Closing the tab on a failed upload
  and never returning leaks that one file. Narrower than the gap this
  replaced (which assumed no dismiss action would ever exist), but real.
- **`jobQueue.listJobs`-based lookups are unpaginated** (`findTodoPhotoUpload`,
  and `listTodos` the same way) — assumed fine at "a handful of users,"
  stated so it is not copied unexamined into the next module that wants to
  read a job back (see "Where the photo itself goes, and when it leaves").
- ~~No manual todo-creation or edit form was built in the UI this
  milestone, only the backend CRUD (step 1) and the checkbox this step
  added.~~ **Resolved outside this milestone's own scope**, during
  Aujourd'hui's later visual reprise (`docs/UI.md`): `TodayScreen`'s
  add-todo form now uses the CRUD this step already exposed. Left here,
  struck rather than deleted, since this doc predates that work and a
  reader diffing it should see why the claim changed, not wonder if it
  was ever true.
- Pomodoro and Spotify: not designed, not built, not routed — M7 in full,
  per this module's own header and `docs/MILESTONES.md`. Nothing in this
  milestone's implementation forecloses either.
- **A day cell from an adjacent month (Calendar section above) is inert —
  not a design decision on its own, just where "never claim a day is
  empty when it was never fetched for" left it.** Two ways to resolve
  this, neither chosen: **(a)** clicking it switches the browsed month to
  that neighbour with the day pre-selected, so the click still does
  something; or **(b)** leave it unclickable, but make that visually
  unambiguous (no hover state at all, greyed further) so it reads as
  inert rather than as a button that silently does nothing. Whichever is
  picked needs its own `docs/UI.md` note before it's built.
- **No "Aujourd'hui" shortcut back to the current month from one browsed
  far away** — only "Mois précédent"/"Mois suivant", one month at a time.
  Not evaluated as a requirement when the screen was built, not something
  a user has asked for; named here so it isn't mistaken for an oversight
  if someone goes looking for it.
