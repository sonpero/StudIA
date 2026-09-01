# Module `progress` — M5

(Renamed from `planning`. The module no longer schedules anything, so the old
name stopped describing what it does. The rename is a dedicated, mechanical
commit — module directory, exports, routes, web client, dependency-cruiser
rule, cross-references — kept separate from the behavioural changes below.)

## Responsibility

Turning a course's notions, their FSRS review state, and an optional deadline
into two read-only percentages and a status: **coverage** (how much of the
course has been touched at all) and **readiness** (how well it would hold up
on exam day if nothing else happens). No ordering, no daily dose, no
availability, no dated plan. The person decides what to do about the numbers;
this module only tells the truth about where things stand.

**This module contains no LLM call and never will.** `dependency-cruiser`'s
`no-ai-in-progress` rule (renamed from `no-ai-in-planning`, same pattern)
forbids `progress/**` from importing any AI package. Difficulty labels and
FSRS card state arrive as data from `content` and `review`; the computation
is arithmetic.

**This module does not import `ts-fsrs`, directly or otherwise.**
`no-fsrs-outside-review` (`ts-fsrs` importable only from
`review/domain/scheduler.ts`) needs no change: `progress` never touches the
library. Retrievability is computed inside `review` and crosses the module
boundary as a plain number — see Ports below.

## Domain

One pure function, same shape of contract as the old `buildPlan`: everything
else in the module exists to feed it plain data and read back its result.

```ts
export const PROGRESS_STATUS_MARGIN = 0.1;               // see "Status" below
export const PROGRESS_RECENTLY_ADDED_DAYS = 7;           // see "Coverage" below
export const PROGRESS_TARGET_READINESS = 0.9;            // see "Status and the target trajectory" below
export const PROGRESS_NO_DEADLINE_HORIZON_DAYS = 14;     // see "Readiness" below

type ProgressCardState = { retrievability: number; reviewed: boolean };

type ProgressNotion = { id: string; createdAt: string; cards: ProgressCardState[] };

// date/setAt are both plain ISO dates (YYYY-MM-DD) at the precision this
// function needs; the application layer truncates deadlines.createdAt's
// timestamp down to a date before calling in.
type ProgressDeadlineInput = { date: string; setAt: string };

type CourseProgress = {
  coverage: number;                // 0..1
  readiness: number;               // 0..1
  status: 'ahead' | 'on-track' | 'behind' | 'no-deadline' | 'deadline-in-past';
  behindByNotions: number;         // 0 outside 'behind'
  recentlyAddedUnreviewed: number; // count, see "Coverage" below
};

type ProgressInputError = { kind: 'deadline-in-past' };

function computeProgress(input: {
  notions: ProgressNotion[];
  deadline: ProgressDeadlineInput | null;
  now: Date;
}): CourseProgress;
```

**`computeProgress` cannot fail** (revised: it originally returned
`Result<CourseProgress, ProgressInputError>`, `Err` exactly when
`deadline.date` was in the past). That design made the past-deadline case
disappear from `ProgressScreen`'s own card entirely — coverage and
readiness are real numbers regardless of the deadline, so discarding them
alongside the target/status computation that genuinely does stop making
sense was a bigger blast radius than the defect it was guarding against.
`ProgressInputError` itself is unchanged and still real: `notionsBelowTarget`
below still returns it, deliberately, for its own reasons.

### Why `ProgressCardState`, not a raw FSRS card

The original shape considered for this input was the FSRS card itself
(`stability`, `difficulty`, `due`, `last_review`…), with `computeProgress`
calling `ts-fsrs`'s forgetting curve internally. That is impossible without
either importing `ts-fsrs` from `progress` (forbidden) or opening
`no-fsrs-outside-review` to a second file (a rule nobody would trust after
that). Instead, `review` exposes the projection as a pure number (see Ports),
and the plain data crossing into `progress` is already-computed
`{ retrievability, reviewed }` per card. `computeProgress` never knows FSRS
exists.

### Coverage

```
coverage = (notions with at least one card where reviewed === true) / total notions
```

Zero notions → `coverage = 0` (see Edge cases).

**`reviewed` and `retrievability` must come from the same row of the same
query.** Both are read off `review.getCardSchedulesForDocument`'s result in a
single pass — never `reviewed` from one repository call and `retrievability`
recomputed from another. Two independently-timed reads of the same card's
schedule can disagree (a review lands between the two calls) and would
silently break the `readiness <= coverage` invariant on an unlucky request.
This is enforced by having exactly one port method return both facts
together (see Ports), not by a domain-level consistency check — CLAUDE.md's
"don't validate what can't happen": the fix belongs in the query shape, not
as defensive code reacting to two sources that should never have existed.
Covered by an integration test asserting the query returns one row per
active card with `schedule` populated or `null`, never a partial state.

**`recentlyAddedUnreviewed` explains a low coverage number without
remembering what coverage used to be.** This module computes everything at
read time and stores nothing — no plan, no history, no snapshot of a
previous reading — so it has no way to literally detect "coverage just
dropped." What it can state, statelessly, from data it already has, is a
present-tense fact:

```
recentlyAddedUnreviewed = count of notions where
  daysBetween(notion.createdAt, now) <= PROGRESS_RECENTLY_ADDED_DAYS
  AND the notion is not covered (same reviewed === false test as coverage above)
```

No new port: `content.listNotions` already returns each notion's
`createdAt`. `PROGRESS_RECENTLY_ADDED_DAYS = 7` — long enough that a
student who doesn't open the app the same day a new page is split still
sees the explanation days later; short enough that a notion neglected for a
month doesn't get miscategorised as "just added," which would read as an
excuse rather than an explanation. One exported constant, same reasoning as
`PROGRESS_STATUS_MARGIN`.

This never claims a drop happened — it is true or false independent of
whatever coverage previously read, and it is exactly what the UI shows
wherever a stateful "coverage dropped" message was originally sketched (see
`docs/UI.md`).

### Readiness

```
R(card)   = 0 if never reviewed, else the FSRS retrievability of that card
            projected to the target date (see below)
R(notion) = average of R(card) over the notion's cards; 0 if the notion has
            no cards at all
readiness = average of R(notion) over every notion; 0 if there are no notions
```

Minimum-of-cards was considered for `R(notion)` and rejected for the number
this module displays: a single unlucky flashcard would make an otherwise
solid notion read as unprepared, which is not what "how ready for this
course" should mean. **It becomes relevant again in M6**, where a per-notion
priority for *what to review next* wants the weakest card, not the average.
Do not pull that forward now — `progress` has no notion of "what to do next"
in M5.

**Target date for the projection:**
- With a deadline: the deadline's own date. Not "today" — the number answers
  "if nothing changes between now and the exam, how will this notion hold
  up," which is the question a deadline exists to answer. Today's date would
  answer a different, less useful question ("am I ready this instant"),
  already covered informally by `review`'s due-card counts.
- Without a deadline: `now + PROGRESS_NO_DEADLINE_HORIZON_DAYS days`
  (`= 14`). A fixed no-deadline anchor date would never move, so nothing in
  this module would ever reflect the passage of time when no deadline is
  set — a rolling two-week window is a modest, honest stand-in for "the
  near future": short enough to still feel imminent rather than
  hypothetical, long enough that a single missed day doesn't swing the
  number. Unlike `PROGRESS_TARGET_READINESS` above, there is no deadline to
  anchor this choice to — it is a judgment call, not a derived value — kept
  in its own exported constant for the same reason: so it can be retuned
  without hunting through the formula.

### A deliberate consequence: readiness does not decay from time alone when a deadline is set

Retrievability projected to a **fixed** date is, mathematically, a function
of `last_review` and that fixed date only (`ts-fsrs`'s
`get_retrievability`: `t = date_diff(projectionDate, last_review, "days")`).
Neither term moves when `now` merely advances with no review happening. So
with a deadline set, **`readiness` for this course does not change on its
own** — it only moves after an actual review, a change in notion count, or
an edited deadline.

This was the opposite of an early draft of this spec, which asked for
"readiness decreases with time if the user does nothing," stated as a
general rule. That rule and "project to the deadline, not today" cannot both
hold: decay-from-idleness needs a projection target that itself slides
forward with `now` (true of the no-deadline 14-day window, false of a fixed
deadline). Rather than smuggle in a second, incompatible meaning of
"readiness" for the deadline case, this spec keeps the honest one and moves
the idleness signal to `status` instead (below) — and it happens to fit
`docs/UI.md`'s "no urgency" rule better anyway: a number that quietly drops
every day you don't open the app is exactly the ambient-guilt mechanic that
rule exists to forbid. What the student sees is stable until they do
something to change it, and what changes on its own is the one field whose
whole job is to say "the window is closing" — `status`.

### Status and the target trajectory

Only meaningful with a deadline. The target trajectory is a straight line
from `0` at the moment the deadline was **set** (`deadline.setAt`, i.e.
`deadlines.created_at` — not the course's upload date, and not `now`) to
`PROGRESS_TARGET_READINESS` on the deadline date itself:

```
spanDays = daysBetween(setAt, deadline.date)
fraction = spanDays <= 0 ? 1 : clamp(daysBetween(setAt, today(now)) / spanDays, 0, 1)
target   = PROGRESS_TARGET_READINESS * fraction   // always in [0, PROGRESS_TARGET_READINESS]
```

`PROGRESS_TARGET_READINESS = 0.9`, not `1.0`: this is not an arbitrary
round number, it is exactly `review`'s own `request_retention` — `ts-fsrs`'s
`default_request_retention` (`review/domain/scheduler.ts` never overrides
it), the retention level that already decides when `review` considers a
card due for review in the first place. The target this module reports a
course against is the same bar `review` is already tuned to maintain, not a
second, independently-invented notion of "ready." If `review`'s configured
retention is ever changed, this constant should be revisited alongside it
— they are not wired together in code (`progress` still does not import
`ts-fsrs` or anything from `review`'s configuration), so keeping them
numerically aligned is a discipline, not an enforced invariant.

`target` is evaluated **at `now`**, not at the deadline (unlike `readiness`,
which is always evaluated at the deadline). This is what lets `status` react
to time passing even though `readiness` itself does not: as `now` advances
with no activity, `target` climbs toward `PROGRESS_TARGET_READINESS` while
`readiness` stays put, so the gap between them shrinks and `status` can
only get worse, never better, on its own.

```
gap = readiness - target
status = readiness < target        ? 'behind'
       : gap > PROGRESS_STATUS_MARGIN ? 'ahead'
       : 'on-track'
```

The margin is asymmetric on purpose: **`behind` fires the instant readiness
dips under the line**, with no slack — understating a shortfall is the one
error this metric must never make. The `0.1` margin only guards the
optimistic side, so a lucky or noisy retrievability estimate a few points
above the line doesn't get reported as `'ahead'` when it's really just
`'on-track'`. `0.1` (ten points) was picked as roughly one notion's worth of
slack in a typical course size, not a per-notion computation — it's a flat
band, kept in one exported constant (`PROGRESS_STATUS_MARGIN`) so it can be
retuned without touching the comparison logic.

**On the deadline day itself, `target` always equals
`PROGRESS_TARGET_READINESS` — and that is not shown as `status`/
`behindByNotions`.** `fraction = 1` on the deadline date by definition of
the trajectory (it reaches its ceiling exactly there, whatever the span
was), so any course under 90% readiness would otherwise flip to `'behind'`
with `behindByNotions` counting nearly every notion, on the one morning
nothing can be done about it — the worst possible moment for the loudest
possible alarm, the exact opposite of `docs/UI.md`'s "no urgency" rule.
Rather than special-case the arithmetic (which would make `target` a
different, discontinuous function on its last day, complicating the
`review` reuse this module is meant to enable), the fix is a **display
rule**: the UI never renders `status`-driven styling (`--warning`) or
`behindByNotions` when `today(now) === deadline.date`. It shows `coverage`
and `readiness` plainly, with a neutral "c'est aujourd'hui" framing, no
status word. `computeProgress` itself keeps computing `status` and
`behindByNotions` normally that day — deterministic, uniform, no
day-of-week branch in the pure function — because a future `review`
priority queue reusing `R(notion) < target(now)` (see `behindByNotions`
below) has legitimate use for that value even on exam day; only the
*display* of it to the student is suppressed.

A deadline **set** for today (`spanDays <= 0`, i.e. `deadline.date ===
setAt`'s date) is not a separate case to handle: it is simply always
"the deadline day" from the moment it's created, so the same display rule
already covers it without a second branch.

Why anchor the trajectory on `deadline.setAt` and not the course's upload
date: a course uploaded three months ago with a deadline set today, two
weeks out, must start its ramp from today — anchoring on the upload date
would report it as already massively behind before the student has had a
single day against this exam. The ramp restarts only when the deadline is
deleted and a new one set (a fresh `setAt`); **moving the date of an
existing deadline must not reset it** — see the `setDeadline` fix below.

**Existing rows are already affected.** The bug this fix addresses has been
live since M5 originally shipped: every `POST` to an existing deadline has
been overwriting `created_at` with that update's `now`, not just going
forward from when this spec is implemented. Any deadline in production that
has ever been edited after its first creation currently has a `created_at`
that is more recent than the real "when this exam was first put on the
calendar" — its target trajectory will read as compressed (ramping up
faster than it should) until the next time that deadline is deleted and
re-set. The fix stops the bleeding for future edits; it does not repair
rows already affected, and this spec does not ask for a backfill migration
— there is no way to recover the true original `created_at` from the
overwritten data. Worth a one-line mention in the PR description implementing
the fix so nobody mistakes an oddly steep existing trajectory for a new bug.

### `behindByNotions`

Only computed when `status === 'behind'`; `0` otherwise. Definition:

```
behindByNotions = count of notions where R(notion) < target(now)
```

**This replaces an earlier draft of this definition**, which set
`behindByNotions` to the smallest number of notions that, if raised exactly
to `target`, would bring the course average back to `target` — a
theoretical floor. That number does not correspond to anything a real
review produces: projected retrievability moves by an amount FSRS derives
from a card's stability, never by an amount chosen to land exactly on
`target`. The UI copy this count feeds ("7 notions à consolider avant
l'échéance") reads as an actionable instruction, so the count itself must
name something real — "these specific notions currently sit below where
they need to be," not an abstract quota nobody's next review actually
produces. The per-notion threshold above is exactly that: a concrete,
identifiable set.

**Correction to an earlier draft of this section**, which suggested
`review`'s M6 successor to `getDueCards` would reuse this exact selection
directly. It cannot: computing `target(now)` needs the deadline and the
trajectory formula, both of which live in `progress`; `review` importing
`progress` for that while `progress` already imports `review` (for
`getCardSchedulesForDocument`/`projectRetrievability`, above) is a real
runtime dependency cycle, not just a style concern — `progress`'s own
`assemble-progress-notions.ts` already has a live, value-level `import {
projectRetrievability } from "../../review/index.js"`, so the reverse edge
would close the loop for real, not hypothetically. `docs/modules/
workspace.md` resolves this: `progress` exposes the same selection as a
plain read (`notionsBelowTarget` / `notionsBelowTargetForDocument`, gated
the same way `behindByNotions` is, and doing no I/O of its own — see
below), and `workspace` is the one
that composes it with `review.getDueCards`, since aggregation across
modules is `workspace`'s whole charter and neither `progress` nor `review`
needs to know the other exists for this. `progress` still never orders or
recommends anything itself — it hands back membership, not a priority.

Expressed in notions, never in percentage points or minutes — a course-level
count is the only thing this module can honestly say; it has no per-review
time estimate to offer (that table is gone with `availability`, see below).

**Deterministic, trivially.** A count of notions each independently
satisfying `R(notion) < target(now)` — no sort, no greedy selection, no
tie-break to reason about.

**Coherent with `target` and `readiness` by construction.** Reuses exactly
the same per-notion `R(notion)` values already averaged into `readiness`,
compared against the exact same `target` number `status` was already
compared against. If `target` or any card's `R` changes, this count is
recomputed from that same call's inputs — never from a cached or
partially-stale value.

**Never zero when `status === 'behind'`; always zero otherwise.** If every
notion had `R(notion) >= target`, their average — `readiness` — would also
be `>= target`, so `status` could not be `'behind'` in the first place:
`behindByNotions >= 1` is guaranteed whenever it is computed at all.
Outside `'behind'` it is always exactly `0` — never a small positive number
for `'on-track'` (a notion just under the margin-widened `'on-track'` band
is, by definition, not behind), never computed for `'ahead'` or
`'no-deadline'`. Both directions are asserted as their own property tests.

Worked edge case, same numeric outcome as the earlier definition but now
for a simpler reason: if every notion currently has `R = 0` (nothing ever
reviewed) and `target > 0`, every notion satisfies `R < target`, so
`behindByNotions` is the **total notion count** — every notion genuinely
needs attention, not a formula quirk.

### `notionsBelowTarget` — the same selection, as identities (PROPOSED, for M6)

**Not yet implemented — a coupling point for `docs/modules/workspace.md`,
shown here for review before it is written**, same discipline as
`getCardSchedulesForDocument` in M5. Same input, same per-notion test as
`behindByNotions`, but returns which notions rather than how many:

```ts
export function notionsBelowTarget(input: {
  notions: ProgressNotion[];
  deadline: ProgressDeadlineInput | null;
  now: Date;
}): Result<string[], ProgressInputError>;
```

`Result` shares `computeProgress`'s own `ProgressInputError` — a
`deadline-in-past` course has no meaningful `target` to compare against,
so this returns `Err`, the same shape `computeProgress` itself used to
return before `computeProgress` stopped being a `Result` (see Status
below). The two are allowed to diverge here: `notionsBelowTarget` feeds
`workspace`'s TodayView, which already degrades an `Err` to `[]` at the
call site (`notionsBelowTargetForDocument`) — a stale exam date simply
stops contributing a "notions à consolider" line there, which is already
correct and was never the defect. `computeProgress` feeds
`ProgressScreen`'s own card directly, where discarding the whole
computation on the same condition made coverage and readiness disappear
too — a different, real defect this revision fixes without touching
`notionsBelowTarget`'s own contract at all.

**Gated exactly like `behindByNotions`, not a raw per-notion test.** The
returned array is empty whenever the course's own `status !== 'behind'` —
even though some individual notion's `R` can in principle sit below
`target` while the course-level average still reads `'on-track'` (the
`0.1` margin absorbs that). `behindByNotions` already made this product
call (never a small positive count outside `'behind'`); this function
must agree with it, or a course `docs/modules/progress.md`'s own screen
calls `'on-track'` would show up in `workspace`'s TodayView as "notions
needing work," a direct contradiction between two screens reading the
same computation. Implemented by factoring the shared `target`/`status`
arithmetic out of `computeProgress` into one internal helper both this
function and `computeProgress` call, never by duplicating the formula —
covered by a property test asserting the two functions never disagree
(non-empty result here iff `computeProgress`'s `status === 'behind'` for
the same input), in addition to `notionsBelowTarget`'s own edge cases.

**No order.** The array is in whatever order `notions` arrived in (i.e.
`content.listNotionsForUser`'s own order) — no sort by "most behind,"
no priority, no ranking. `workspace` decides how (or whether) to sequence
or group what it receives; `progress` hands back a set, per its own Out
of scope rule below.

**Revised after review: not a batched, self-fetching "ForUser" function.**
An earlier draft of this section proposed
`getNotionsBelowTargetForUser(deps, userId, now)`, doing its own
`listNotionsForUser` + `getCardSchedulesForUser` + `getDeadlinesForUser`
reads, "mirroring `listProgress`'s batched shape." That is wrong the moment
`workspace.getToday` needs *both* this and `upcomingDeadlines` (also sourced
from those same three reads, today via `listProgress`): two independent
calls into `progress` would each redo the same three batched reads,
silently reintroducing the exact N+1-across-the-request problem `listProgress`
was built to avoid within a single call. `workspace`'s own batched reads for
`dueCards` grouping (`content.listNotionsForUser`) already overlap with what
this function would need, too.

The fix is to make the new export **do no I/O of its own at all**, so it is
structurally impossible for it to duplicate a read — the caller always
supplies rows it already has:

```ts
// progress/application/notions-below-target-for-document.ts (PROPOSED)
// Pure given its inputs: no repository, no await, same category as
// assembleProgressNotions above (which it calls internally) — takes rows
// the caller already fetched, for one document.
export function notionsBelowTargetForDocument(
  notions: Notion[],
  cardRows: NotionCardRow[],
  deadline: Deadline | null,
  now: Date,
): string[];
```

Wraps the three existing pieces — builds `ProgressDeadlineInput` the same
way `listProgress` already does inline, calls `readinessProjectionDate`,
then `assembleProgressNotions`, then the new domain `notionsBelowTarget`
above — and collapses its `Result` to a plain array (`Err` → `[]`): a
lapsed deadline has no meaningful target to check notions against, and this
function feeds "what to work on," not a status display, so there is no
"don't silently drop this document" concern to preserve the way
`listProgress`'s own aggregate list has to.

`workspace.getToday` calls this once per document, in memory, after doing
its *own* single round of batched reads (`documentRepo.listDocuments`,
`content.listNotionsForUser`, `review.getCardSchedulesForUser`,
`review.getDueCards`, `progress.ProgressRepository.getDeadlinesForUser` —
the last one called directly, a repository port method already public via
`progress/index.ts`'s `ProgressRepository` type export, exactly like
`content.NotionRepository.listNotionsForUser` and
`review.ReviewRepository.getCardSchedulesForUser` already are) grouped by
`documentId` itself, the same shape `listProgress`'s own loop already uses.
`progress.listProgress` is **not** called by `getToday` at all — see
`docs/modules/workspace.md`'s Use cases section for the full accounting of
which five reads happen, each exactly once, and why none of them are
`listProgress` in disguise.

Same cross-document-leakage risk `listProgress` already has a dedicated
integration test for applies to `workspace`'s own grouping step here — that
test lives in `workspace`'s own test suite (it groups the rows, not
`progress`), not duplicated here.

### Edge cases (never `NaN`, always defined)

| Input | coverage | readiness | status | behindByNotions |
|---|---|---|---|---|
| Zero notions, deadline set | `0` | `0` | `'on-track'` | `0` |
| Zero notions, no deadline | `0` | `0`, projected to `now + PROGRESS_NO_DEADLINE_HORIZON_DAYS` | `'no-deadline'` | `0` |
| No deadline (any notion count) | as above | projected to `now + PROGRESS_NO_DEADLINE_HORIZON_DAYS` | `'no-deadline'` | `0` |
| Deadline = today | as above | as above | computed normally, `spanDays = 0` → `fraction = 1`, `target = PROGRESS_TARGET_READINESS` — not displayed as `status`/`behindByNotions`, see above | as above, not displayed |
| All notions never seen | `0` | `0` | computed normally (often `'behind'` once `target > 0`) | see worked case above |

**Precedence: whether a deadline is set is checked first.** `'no-deadline'`
applies whenever `deadline === null`, regardless of notion count — the
zero-notions special case below only modifies the *with-a-deadline* branch;
it never competes with `'no-deadline'`. A course with zero notions and no
deadline is `'no-deadline'`, not `'on-track'` — the "Zero notions" rule
below only fires once a deadline has already been established as present.

Zero notions, with a deadline set, is special-cased to `'on-track'` rather
than left to fall out of the formula: nothing has been generated yet, so
there is nothing to be behind on, and reporting `'behind'` on an empty
course would be exactly the kind of unearned guilt `docs/UI.md` forbids.

`recentlyAddedUnreviewed` is computed the same way regardless of the
deadline branch (it has nothing to do with a deadline) and is `0` exactly
when no notion both exists and falls inside the `PROGRESS_RECENTLY_ADDED_DAYS`
window unreviewed — including, trivially, the zero-notions case above.

`deadline-in-past`: `status: 'deadline-in-past'` when `deadline.date` is
before the start of `now`'s day — revised from the original `Err({ kind:
'deadline-in-past' })` design (see the note under `computeProgress`'s own
signature above). `coverage`, `readiness`, and `recentlyAddedUnreviewed`
are still computed exactly as they would be for any other status, since
none of the three ever depended on the deadline in the first place;
`target` is never computed for this status and `behindByNotions` is `0`,
the same "0 outside 'behind'" convention the type already used for every
other non-`'behind'` status.

## Ports

None of its own beyond its own repository. `progress` reads:

- `content.listNotions(userId, documentId)` — the authoritative notion list,
  including notions with no cards generated yet (`cards: []`, contributes
  `0` to both coverage and readiness). This is a different concern from the
  reviewed/retrievability pairing below and may come from a separate call.
- `review.getCardSchedulesForDocument(userId, documentId)` — **new**, added
  to `review`'s port in this milestone:
  ```ts
  getCardSchedulesForDocument(
    userId: string,
    documentId: string,
  ): Promise<{ notionId: string; cardId: string; schedule: CardSchedule | null }[]>
  ```
  One row per **active** card belonging to the document's notions —
  `c.state = 'active'`, matching `getNotionCardCounts`'s own filter
  exactly, so the two callers never disagree on how many cards a notion
  has. `schedule` is `null` for a card never reviewed (no `card_schedules`
  row); the null check is on `s.card_id` (the join's key column, aliased
  `scheduleCardId`), not on a payload column like `due` — a payload column
  could in principle be null on a real row without meaning "no row," the
  join key cannot. Same `LEFT JOIN` shape as the existing
  `getNotionCardCounts` helper `review` already has internally. `progress`
  groups this single result set by `notionId` and derives both `reviewed`
  (`schedule !== null`) and `retrievability` from the same row — never a
  second call, and never `review.getNotionsProgress` (a different,
  mastery-threshold-based definition of "done," wrong for coverage's "has
  this ever been opened"). Covered by a dedicated integration test:
  `docs/TESTING.md`.

  **A notion whose only cards are `stale`** (the notion's body changed
  since generation — `cards.state` is `'active' | 'stale'`, there is no
  soft-delete state; a hard-deleted card's row is simply gone) produces no
  rows here, identically to a notion with zero cards at all: `cards: []`,
  uncovered, `R = 0`. This is intentional, not an oversight — a stale
  card's historical review state says nothing about whether the *current*
  (edited) notion content has been reviewed, and `getNotionCardCounts`
  already excludes stale cards from mastery the same way; `progress`
  staying consistent with that existing convention, rather than inventing
  a second rule for "does this count," is the point of matching the filter
  exactly.
- `review.projectRetrievability(cardSchedule: CardSchedule, at: Date): number`
  — **new**, exported pure function added to
  `review/domain/scheduler.ts` (the one file allowed to import `ts-fsrs`)
  and re-exported from `review/index.ts`:
  ```ts
  // Reuses the existing private toFsrsCard() already in this file.
  export function projectRetrievability(cardSchedule: CardSchedule, at: Date): number {
    return engine.get_retrievability(toFsrsCard(cardSchedule), at, false);
  }
  ```
  Called once per non-null `schedule` row from the same
  `getCardSchedulesForDocument` result, with the target date resolved by
  `progress`'s own application layer (deadline date, or
  `now + PROGRESS_NO_DEADLINE_HORIZON_DAYS`).

This is a real addition to `review`'s public surface — not a schema change
(no new table, no new column), just a new query and a new pure export — but
it is a cross-module coupling point worth a second pair of eyes before it
lands, since `review` is not this module's own to change unilaterally.

**Batched counterparts, added for `listProgress` (below), to avoid an N+1
read across every course:**

- `content.NotionRepository.listNotionsForUser(userId): Promise<Notion[]>`
  — every notion the user owns, across every document, in one query.
- `review.ReviewRepository.getCardSchedulesForUser(userId): Promise<{ documentId: string; notionId: string; cardId: string; schedule: CardSchedule | null }[]>`
  — the batched counterpart to `getCardSchedulesForDocument`: same
  null-sentinel, same `c.state = 'active'` filter, minus the `document_id`
  filter, plus `documentId` per row so the caller can group without a
  second read per document. `getCardSchedulesForDocument` itself is
  unchanged and still what `getCourseProgress` (single document) calls.
- `progress.ProgressRepository.getDeadlinesForUser(userId): Promise<Deadline[]>`
  — this module's own table, no cross-module review needed.

**Assumed limitation, stated so it isn't copied elsewhere unexamined:**
`listNotionsForUser` and `getCardSchedulesForUser` return everything for the
user in one shot, no pagination. Acceptable at this app's current volume
(CLAUDE.md: "a handful of users") where a user's total notion/card count
across every course is small. This stops being true the moment a single
user's course count grows enough that "every active card's schedule" is a
large result set — at that point this pattern needs revisiting (a paginated
or streamed read), not copying as-is into the next module that wants an
N+1 fix.

## Use cases

- `setDeadline(userId, documentId, date, now, label?)` — unchanged
  behaviour, **except one fix**: the previous implementation always wrote
  `createdAt: now.toISOString()`, even when updating an existing deadline,
  silently resetting the trajectory's start date on every edit. Fixed to:
  ```ts
  createdAt: existing?.createdAt ?? now.toISOString()
  ```
  A brand-new deadline gets `createdAt = now`; updating an existing one
  (date and/or label) preserves the original `createdAt`. The ramp only
  restarts via `DELETE` followed by a fresh `POST`. Two unit tests required:
  first-set gets `now`; update-in-place preserves the original timestamp.
- `deleteDeadline(userId, documentId)` — unchanged
- `getDeadline(userId, documentId)` — **new application function**, thin
  read of the repository, backing the new `GET` route below (this fills the
  M5-as-shipped debt: the deadline form was write-only)
- `getCourseProgress(userId, documentId, now)` — named `getCourseProgress`,
  not the `getProgress` this spec originally used: `review` already exports
  its own `getProgress` (the `{mastered, total, nextDueDate}` due-count
  summary), and `packages/core/src/index.ts`'s barrel re-exports every
  module with `export *` — two modules exporting the same name there is a
  build error (`tsc`: "Module has already exported a member"), not a style
  preference. Found and fixed while wiring this into the barrel; `review`'s
  own `getProgress` is untouched. Assembles `computeProgress`'s
  input from `content.listNotions`, `review.getCardSchedulesForDocument` +
  `review.projectRetrievability`, and this module's own `getDeadline`
  (fetched exactly once); calls `computeProgress`; returns that same fetch's
  `deadlineDate`/`deadlineLabel` alongside the `CourseProgress` (revised:
  no longer a `Result` — see `computeProgress`'s own note above; a
  `deadline-in-past` course is a normal return with `progress.status ===
  'deadline-in-past'`, not a separate error branch), so a caller can render
  "Maths, contrôle dans 9 jours…" without a second read of the deadline:
  ```ts
  { progress: CourseProgress; deadlineDate: string | null; deadlineLabel: string | null }
  ```
  Never persists the computation, same principle as the old `getPlan`. Does
  **not** fetch the document's `title` — the caller already has the
  `Document` in hand (the route's existing ownership check, or
  `listProgress`'s own `documentRepo.listDocuments` call below) and
  composes it into the response, see API below.
- `listProgress(userId, now)` — the equivalent of calling `getCourseProgress`
  for every one of the user's documents, but **never actually loops it**:
  four batched reads total (`documentRepo.listDocuments`,
  `content.listNotionsForUser`, `review.getCardSchedulesForUser`,
  `progress.getDeadlinesForUser`), grouped in-memory into three `Map`s keyed
  by `documentId`, never N+N+N reads. A document past its deadline is
  **not** silently dropped (unlike the old `getToday`, which dropped
  `PlanningInputError` documents from an aggregate the user never sees
  per-item) — a stale exam date is something the person can act on. This
  no longer needs a special case to guarantee: since `computeProgress`
  itself can't fail (see above), every document produces one
  `ProgressListItem`, uniformly.

  **Two failure modes this grouping step can introduce, both covered by a
  dedicated integration test with real repositories, not fakes:**
  - *Cross-document leakage*: a `Map` keyed wrong (or not keyed by
    `documentId` at all) doesn't throw and doesn't violate any bound — the
    numbers stay internally consistent, they just describe the wrong
    course. Tested with two documents, one fully covered and one fully
    uncovered, asserting each keeps its own exact values, checked in both
    directions.
  - *Silent disappearance*: **the final assembly iterates over
    `documentRepo.listDocuments`, never over the grouping `Map`s' keys.** A
    document with zero notions is absent from all three `Map`s entirely; if
    the loop walked a `Map`'s keys instead, that document would vanish from
    the list instead of showing a coverage-0/readiness-0 entry. Tested
    directly: a document with no notions still produces a normal
    `ProgressListItem` entry.

  Composes `title` (from `documentRepo`) with `getCourseProgress`'s
  assembly logic (factored into `assembleProgressNotions`, shared by both
  use cases so the notion/card grouping logic is written once) into one
  `ProgressListItem` per document. See API below for the shape.

## Persistence

`deadlines` is untouched — same table, same columns, same data:

```sql
CREATE TABLE deadlines (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  date TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL
);
```

`availability` and `plan_history` are dropped. **Migration discipline,
stated explicitly because this runs against a production volume:**

- **No existing migration is modified or deleted.** `0000`–`0006` are left
  byte-for-byte as they are — `0006` is already applied to the production
  Railway volume, and editing an already-applied migration is how a
  migration runner gets permanently out of sync with a live database.
- This ships as **one new, numbered forward migration**, next in sequence
  after `0006`, containing only:
  ```sql
  DROP TABLE availability;
  DROP TABLE plan_history;
  ```
- **`deadlines` is preserved completely**: table, columns, every existing
  row, and its `deadlines_document_unique` constraint (one deadline per
  document) — none of that is touched by this migration or by anything
  else in this rewrite.
- **The full migration chain is tested on two starting points**: an empty
  database (runs `0000` through the new migration in order — `0006`
  creates `availability`/`plan_history`, the new migration drops them
  again, a no-op in effect but exercised for real) and a database already
  sitting at `0006` (as production is) — asserting in both cases that
  `availability` and `plan_history` are gone afterward and `deadlines`
  still has every row it had before, with `deadlines_document_unique` still
  enforced (a second `POST` for the same document still upserts rather than
  duplicating).

`progress/infra/schema.ts` keeps only `deadlinesTable`; `availabilityTable`
and `planHistoryTable` are deleted along with their file-level exports from
`progress/index.ts`.

## API

| Route | Purpose |
|---|---|
| `POST /api/documents/:id/deadline` | Set or update (unchanged) |
| `DELETE /api/documents/:id/deadline` | Remove (unchanged) |
| `GET /api/documents/:id/deadline` | **New.** `200 { date, label }` if set, `404 { error: "no-deadline" }` if not — a distinct body from the `403 { error: "not-found" }` ownership check in the same file; both used to read `"not-found"` for two different meanings. Fills the M5-as-shipped debt. |
| `GET /api/documents/:id/course-progress?today=` | One course's progress, see shape below |
| `GET /api/course-progress?today=` | Every course, see shape below |

**Named `course-progress`, not `progress` (diverges from an earlier draft of
this spec, which wrote `GET /api/documents/:id/progress` and
`GET /api/progress`).** `review` already owns
`GET /api/documents/:id/progress` — discovered as a genuine route collision
at boot time (Fastify: `FST_ERR_DUPLICATED_ROUTE`) while wiring this route
in, not a naming preference. Investigated before deciding which side
renames, per this module's own rule about not touching another module's
surface unilaterally:

- `review`'s route returns `{ mastered, total, nextDueDate }` — a
  **document-level** mastery summary (`review/application/get-progress.ts`),
  not per-notion; per-notion mastery is the separate, differently-named
  `GET /api/documents/:id/notions-progress`
  (`review.getNotionsProgress`). So it isn't "the less accurate name" either
  — both routes are legitimately "document-level progress," just narrower
  in what `review`'s reports (three counters, no coverage/readiness/status).
- It is **already consumed**: `apps/web/src/lib/notions-api.ts`'s client
  function calls it, used by both `NotionsScreen` and `ReviewScreen`, each
  with a dozen-plus existing unit tests asserting against that exact
  URL/shape. Renaming it would be a real, working M3/M4 feature changed for
  a naming preference, in a module this rewrite does not own.

Both facts point the same way: `progress`'s own new routes rename, not
`review`'s existing one. The aggregate route is `course-progress` too, for
symmetry, even though a bare `/api/progress` would not itself have
collided. Same root cause and same fix shape as `getCourseProgress` not
being named `getProgress` (see Use cases below): this module's names keep
bumping into modules it doesn't own, at both the function and the route
layer — recorded here so the next person who notices "course-progress" is
an odd name doesn't have to redo this investigation.

Removed entirely: `PUT /api/availability`, `GET /api/documents/:id/plan`,
`GET /api/plan/today`, `POST /api/plan/days/:date/complete`.

**`today` stays client-computed, required, `YYYY-MM-DD`, 400 if missing or
malformed** — identical rule and identical helper
(`apps/web/src/lib/day-boundary.ts`'s `todayDateKey()`) as before; this part
of the contract does not change.

**`deadline-in-past` maps to `200`, not `422`.** Revised from the original
design (same `422` treatment as the old `PlanningInputError`): once
`computeProgress` stopped being able to fail, there was no longer an error
condition for the route to map at all — a lapsed deadline is a normal,
successful read whose `progress.status` happens to be `'deadline-in-past'`.

**Both routes carry enough to build the mandatory status phrase**
("Maths, contrôle dans 9 jours, 54 % de préparation, 7 notions à consolider
avant l'échéance") **without a second call.** `CourseProgress` alone cannot:
it has no course title and no deadline. Every response carries `title`,
`deadlineDate`, and `deadlineLabel` alongside the progress data, so a
lapsed deadline can render its own actionable phrase too, not just the
on-track path.

```ts
// GET /api/documents/:id/course-progress?today=
// 200, always:
{ title: string; deadlineDate: string | null; deadlineLabel: string | null; progress: CourseProgress }

// GET /api/course-progress?today= — an array, one entry per document, so a
// stale deadline is visible rather than silently missing:
type ProgressListItem = { documentId: string; title: string; deadlineDate: string | null; deadlineLabel: string | null; progress: CourseProgress };
```

The single-document body deliberately mirrors `ProgressListItem` minus
`documentId` (already known from the URL) rather than inventing a
differently-shaped body — one rendering component can consume either.
`deadlineDate`/`deadlineLabel` are `null` only when no deadline is set at
all, regardless of `progress.status`.

Both `GET` routes on a specific document keep the existing ownership check
(`403` if the document doesn't belong to the caller) used by the current
deadline routes.

## UI

Replaces `PlanningScreen` entirely — no day list, no availability forms. One
line per course plus two gauges:

> *"Maths, contrôle dans 9 jours, 54 % de préparation, 7 notions à
> consolider avant l'échéance."*

Two notes on that phrase versus the version sketched earlier in this spec's
draft ("7 notions de retard"): **"de retard" reads as blame under
`docs/UI.md`'s "never comment on pace or effort, no 'tu es en retard'" rule**,
even attached to a number rather than the person directly. "à consolider
avant l'échéance" states the same fact (a count of notions,
`behindByNotions`) without the lateness framing. `docs/UI.md`'s own approved
example ("14 fiches à revoir") is exactly this register.

A third note, now that `behindByNotions` counts notions with
`R(notion) < target(now)` rather than a theoretical floor: the phrase is
literally accurate, not just tonally careful. Each of the seven notions the
number names really is currently below where it needs to be — the same set
`review`'s future priority queue is expected to reuse — not an abstract
quota with no concrete referent.

Required behaviour, all traceable to `docs/UI.md`:

- **Coverage and readiness are neutral progress devices** (`--primary` ring
  or bar over `--border`, with the real number always visible, never a bare
  ring) — never the course's subject colour, per the "subject colours are
  identity only" rule.
- **`--warning`, never `--accent`, for `'behind'`.** No red, no alarm
  styling. `'behind'` is a fact stated plainly, with the `behindByNotions`
  count and no comment on why or since when.
- **No urgency, ever**: no countdown, no streak, no "tu es en retard". The
  days-until-deadline figure ("contrôle dans 9 jours") is a fact, not a
  countdown widget — it doesn't tick, animate, or turn red.
- **Coverage can look low right after notions are added** — the denominator
  grows the moment `content` finishes splitting a newly uploaded page. The
  screen never claims "coverage dropped": this module keeps no previous
  reading to compare against (no plan, no history — see
  `docs/modules/progress.md`'s Coverage section). Instead, whenever
  `recentlyAddedUnreviewed > 0`, it states the present-tense fact behind the
  number: "3 fiches ajoutées récemment n'ont pas encore été travaillées."
  Never leave a low or moved number for the student to puzzle over.
- **The deadline day itself**: never show `status`-driven `--warning`
  styling or `behindByNotions` when `today === deadlineDate` — `target`
  reaches `PROGRESS_TARGET_READINESS` there by definition, so most courses
  would otherwise flip to `'behind'` with a large notion count on the one
  morning nothing can still be done, exactly the alarm-at-the-worst-moment
  `docs/UI.md`'s "no urgency" rule forbids (see
  "Status and the target trajectory" above). Show `coverage` and
  `readiness` plainly with a neutral "c'est aujourd'hui" framing instead.
- **No deadline set**: no phrase about a countdown or a percentage that
  implies one; state the two raw numbers if there is any content
  (`coverage`, and readiness projected to
  `now + PROGRESS_NO_DEADLINE_HORIZON_DAYS`) with an invitation to set a
  deadline, not a warning about the missing one.
- **A `'deadline-in-past'` course in the aggregate list**: an actionable
  line ("cette échéance est passée, mets-la à jour"), never a disappearing
  row and never a raw `422`/error code.
- **Zero notions**: `idle` mascot, an invitation matching `docs/UI.md`'s
  empty-state rule, not a `0 %` readout presented as a problem.
- **Four states**: loading (skeleton list matching the eventual card
  layout), empty (no courses at all — `idle` mascot, invite to upload),
  error (`confused` mascot, retry), ready.
- **No mascot in the ready state**: this is a data-dense list of courses,
  and `docs/UI.md` forbids the mascot there ("never in a data-dense view").
  `idle`/`confused` are reserved for empty/error only.

## Out of scope

Everything the old `planning.md` excluded, plus everything `availability`
made possible: no ordering of what to review next, no daily dose, no minute
estimates, no calendar, no reminders, no todos (`workspace`), no generation.
**"No calendar" means the dated, day-by-day planning grid `planning`/
`availability` used to draw — deleted whole in this M5 rewrite, not
rebuilt in any shape here — not a ban on any calendar-shaped UI anywhere in
the app.** `workspace`'s own read-only Calendrier screen
(`docs/modules/workspace.md`'s Calendar section, `docs/UI.md`) reads this
module's `getDeadlinesForUser` the same way `getToday` already does; it is
a `workspace` composition, same as `getToday`, not a `progress` feature,
and this module still recommends and schedules nothing. Restated here so
the line above isn't cited to reopen a settled question.
`review.getDueCards` remains the only source of "what's due right now";
`progress` never recommends or sequences anything — including through
`notionsBelowTarget`/`notionsBelowTargetForDocument` above: an unordered set
is not a recommendation, and `workspace`, not `progress`, decides what to
do with it.

## Key tests

Property-based (`fast-check`) over `computeProgress`, replacing the old
`buildPlan` invariants:

1. `coverage` and `readiness` always land in `[0, 1]`
2. `readiness <= coverage`, always — true by construction (a notion
   contributes at most `1` to `readiness` only once it's already
   contributing `1` to `coverage`; an uncovered notion contributes `0` to
   both), assert it directly as a property regardless
3. **Monotonicity** (the domain-level form of "a successful review never
   lowers readiness"): raising any single card's `retrievability` input,
   all else fixed, never decreases the resulting `readiness`. This is
   arithmetic, provable from the averaging formula, and tested at
   `computeProgress`'s own level — it does not need `ts-fsrs` at all.
   Separately, an integration-level test exercises the real thing: call
   `schedule()` with a passing grade, then `projectRetrievability` before
   and after at a fixed target date, and assert the projected value did not
   decrease. (`ts-fsrs`'s own behaviour is not re-tested per
   `docs/TESTING.md`; this only checks the wiring.)
4. **No deadline: splits into two halves, not a single property, and not a
   relocation.** The original claim ("readiness decreases with no activity
   as `now` advances") bundles two different things:
   - **4a — domain-level, tested here, non-vacuous.** `computeProgress`
     never recomputes `retrievability` from `now` — it's already-projected,
     opaque input (see "Why `ProgressCardState`, not a raw FSRS card"
     above). So: with `notions` (and therefore every card's
     `retrievability`) held fixed, `readiness` (and `coverage`, same
     reasoning) is **identical for any two valid values of `now`**,
     deadline or no deadline. This is not vacuous despite currently being
     true by construction: nothing stops a future edit from "helpfully"
     inlining a `now`-dependent adjustment straight into `computeProgress`
     (duplicating what `review.projectRetrievability` already does
     upstream) — this property is exactly what would catch that
     regression, proven below by mutating in such an adjustment.
   - **4b — pipeline-level, moves to step 3.** The actual decay — the
     number visibly dropping over time — only happens because `getCourseProgress`
     re-derives `retrievability` every call by projecting to a *sliding*
     `now + PROGRESS_NO_DEADLINE_HORIZON_DAYS` target. That recomputation
     lives outside `computeProgress` entirely (in `getCourseProgress` +
     `review.projectRetrievability`), so this half is tested there, once
     both exist. Same weak-vs-strict shape as originally stated (floored at
     `0`; whole-day granular), just one layer up.
5. **4bis — with deadline**: with fixed notions/cards (no activity) and
   `deadline.setAt <= now1 < now2 <= deadline.date` — bounded to this
   window because `computeProgress` returns `Err` for any `now` past
   `deadline.date`, and there is no `status` to compare once it does —
   `status(now2)` never improves on `status(now1)`, under the order
   `ahead > on-track > behind` (`'no-deadline'` excluded, not applicable
   here). This is the property the original "readiness decays" requirement
   was actually protecting; it now lives on `status` instead of
   `readiness`, for the reason above. Note that this property governs the
   *computed* value only — the UI suppresses displaying `status` on
   `now === deadline.date` (see "Status and the target trajectory" above),
   which is a rendering rule, not a reason to narrow this property's domain.
6. Determinism: two identical calls deep-equal, including `behindByNotions`
   and `recentlyAddedUnreviewed`
7. Edge cases from the table above: zero notions, no deadline, deadline
   today, all notions never seen — none ever produce `NaN` or a thrown error
8. `behindByNotions` equals exactly the count of notions with
   `R(notion) < target(now)`; `0` whenever `status !== 'behind'`; `>= 1`
   whenever `status === 'behind'`
9. `recentlyAddedUnreviewed` only counts notions created within
   `PROGRESS_RECENTLY_ADDED_DAYS` of `now` that are not covered; unaffected
   by the deadline branch; `0` for zero notions

Plus:

- Integration: `getCardSchedulesForDocument` returns one row per active
  card with `schedule` correctly `null` vs. populated (no partial/split
  reads — see "Coverage" above)
- Integration: the migration chain drops `availability` and `plan_history`
  and leaves `deadlines` and its rows intact, from both an empty DB and a
  `0006`-era fixture
- Unit: `setDeadline` — first set uses `now` as `createdAt`; updating an
  existing deadline's date/label preserves the original `createdAt`;
  delete-then-set produces a fresh `createdAt`
- Integration: both `GET` progress routes — happy path, `401`, `403` for
  another user's document, `400` for a missing/malformed `today`, `200`
  with `progress.status === 'deadline-in-past'` on the single-document
  route (revised from `422` — see API above)
- Integration: `GET /api/documents/:id/deadline` — `200` with the stored
  value, `404` when none is set, `403` for another user's document
- Playwright: set a deadline, see coverage and readiness, review a due
  card, see readiness rise

## Process

The M5-as-shipped record for the old `planning` module noted that
`build-plan.ts` and `sqlite-planning-repository.ts` were written before
their tests — a real test-first violation, only caught after the fact by
property testing and manual mutation testing. Both files are deleted
entirely by this rewrite, so that specific debt is moot, not carried
forward. It does not excuse a repeat: every file in this rewrite —
`compute-progress.ts`, the repository, the new `review` port method and
export, the routes, the screen — is red, then green, no exceptions. A test
observed passing on first write is treated as a bug in the test, per
`CLAUDE.md`.

## Known debts

None carried forward. The M5-as-shipped debts (`GET .../deadline` missing,
`buildPlan`'s unused `history` field) both disappear with this rewrite: the
first is fixed (new `GET` route above), the second is moot (`history` and
`plan_history` no longer exist).
