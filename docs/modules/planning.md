# Module `planning` — M5

## Responsibility

Turning a course, a deadline and a person's availability into a dated plan of
what to do each day. When there is no deadline, a steady plan; when there is one,
a backward plan from the exam date.

**This module contains no LLM call and never will.** `dependency-cruiser` forbids
`planning/**` from importing any AI package, and that rule is part of the build.
Difficulty labels arrive from `content` as data; scheduling is arithmetic.

## Domain

The planner is one pure function. Everything else in this module exists to feed it.

```ts
function buildPlan(input: {
  notions: { id: string; difficulty: Difficulty; masteredAt: string | null }[];
  deadline: string | null;
  availability: Availability;     // minutes per weekday
  now: Date;
  history: { date: string; completed: boolean }[];
}): Result<Plan, PlanningInputError>;

type Availability = Record<'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun', number>;

type Plan = {
  days: PlanDay[];
  feasible: boolean;              // false when the notions do not fit before the deadline
  shortfallMinutes: number;       // 0 when feasible
};

type PlanDay = {
  date: string;                   // ISO date, no time
  entries: PlanEntry[];
  estimatedMinutes: number;
};

type PlanEntry =
  | { kind: 'learn'; notionId: string; estimatedMinutes: number }
  | { kind: 'review'; notionId: string; estimatedMinutes: number };

// A malformed request, not a workload that doesn't fit. buildPlan refuses to
// guess at these rather than silently producing a nonsensical plan.
type PlanningInputError =
  | { kind: 'deadline-in-past' }  // deadline < start of now's day
  | { kind: 'no-capacity' }       // every weekday has 0 minutes available
  | { kind: 'no-usable-day' };    // deadline is set, some weekday has capacity,
                                   // but none of its occurrences fall within [now, deadline]
```

A notion is **atomic**: one `PlanEntry` (one `estimatedMinutes` value from the
table below) is never split across two days. A single hard notion that doesn't
fit any day's availability is not a `PlanningInputError` — it is exactly what
`feasible: false` exists for (see Infeasibility below).

**Hard invariants — always hold, property-tested, apply to every `Ok` plan
regardless of `feasible`:**

1. No day exceeds its availability
2. Nothing is scheduled before `now` or after the deadline
3. A notion's first `review` falls at least one day after its `learn`
4. `hard` notions get more total minutes than `easy` ones
5. Reviews cluster toward the deadline: the last three days are review-only
6. **Determinism**: identical inputs always produce an identical plan. Assert it
   explicitly with a repeated call — this includes the best-effort ordering
   below, which must not depend on iteration order, `Math.random()`, or
   anything but the inputs.

**Conditional invariant — holds only when `feasible: true`:**

7. Every notion appears at least once as `learn` before the deadline

When infeasible, coverage is best-effort, not absent: `buildPlan` still
schedules as much as fits, in the same order it would use for a feasible
plan — see below — it never drops notions arbitrarily or omits scheduling
entirely just because the whole set doesn't fit.

**Infeasibility is reported, not hidden.** When the workload does not fit
before the deadline, `buildPlan` still returns `Ok(plan)` — never an error —
with `feasible: false`. Never silently overfill a day, and never drop notions
"to make the numbers work" in a way that would violate a hard invariant above.
The UI states the fact plainly and proposes options (more days, less scope);
per `docs/UI.md` it does not scold, and never uses `--accent` for this, only
`--warning`.

- **`shortfallMinutes`** is `requiredMinutes - plannedMinutes`: total estimated
  minutes across every notion's `learn` (plus its first `review`), minus what
  the plan actually placed into entries. It is not the theoretical
  `requiredMinutes - totalAvailableCapacity` deficit — the clustering and
  spacing invariants above (reviews only in the last three days, review ≥1 day
  after learn) can leave raw day-capacity unused even when, summed naively, the
  numbers would seem to fit. `shortfallMinutes === 0` if and only if
  `feasible === true`; that equivalence is asserted directly by a test.
- **Best-effort order** when not everything fits: notion **position** — the
  same order `content.listNotions` and `getDueCards` already use. M5 has no
  per-notion priority field (CLAUDE.md: don't build for a need the current
  milestone doesn't have), and difficulty was considered and rejected in favour
  of position, to keep the plan following the course's own structure rather
  than resequencing it. If a priority field is added in a later milestone, it
  takes precedence over position; until then position is the sole key.

**Invalid input is refused, typed, not silently coerced.** `buildPlan` returns
`Err(PlanningInputError)` — never a `Plan` — for a request malformed enough
that no sensible plan (feasible or not) can be built from it:
- `deadline-in-past`: the deadline is before the start of `now`'s day
- `no-capacity`: every weekday has 0 minutes (a genuine availability
  misconfiguration, not a busy week)
- `no-usable-day`: a deadline is set, at least one weekday has capacity, but no
  occurrence of any such weekday falls within `[now, deadline]` (e.g. deadline
  is tomorrow, tomorrow is a zero-capacity weekday, and today's remaining
  capacity is also zero)

These are distinct from infeasibility: an infeasible plan is a legitimate
request whose answer is "not enough time," reported as data (`feasible: false`
+ `shortfallMinutes`); an invalid input has no meaningful plan to report at
all. `getPlan` (application layer) maps `PlanningInputError` to the API the
same way any other `Result` error is mapped — see API below.

**Estimation.** `estimatedMinutes` per notion is a table, not a model output:
`easy` 8, `medium` 12, `hard` 18 for `learn`; a third of that for `review`. Keep
the table in one exported constant so it can be tuned in one place once real
review durations exist.

**Replanning.** A missed day is not carried forward as debt. `buildPlan` is
called again from today with whatever remains. There is no separate replan
algorithm and no accumulating backlog: this is what makes a missed day
non-punitive, and it is a product decision as much as a technical one.

## Ports

None. This module reads notions and mastery through `content` and `review`
public interfaces, and writes only its own tables.

## Use cases

- `setDeadline(userId, documentId, date, now)` — a date, optionally a label
  ("Contrôle de maths")
- `setAvailability(userId, minutesPerWeekday)` — user-level, not per course
- `getPlan(userId, documentId, now)` — assembles `buildPlan`'s input from
  `deadlines`/`availability` plus notions and mastery read through `content`
  and `review`, calls it, and returns its `Result<Plan, PlanningInputError>`
  unchanged; does not persist the computation
- `getToday(userId, now)` — today's entries across every course, which is what
  `workspace` renders
- `markDayCompleted(userId, date)` — history only, never a streak

**The plan is computed, not stored.** Persist deadlines, availability and
completion history; derive the plan on read. Storing it would need invalidation
on every notion change, every review and every missed day, and stale plans are
worse than a recomputation that takes a millisecond.

## Persistence

```sql
CREATE TABLE deadlines (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  date TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE availability (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  minutes_json TEXT NOT NULL      -- Availability, seven keys
);

CREATE TABLE plan_history (
  user_id TEXT NOT NULL REFERENCES users(id),
  date TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);
```

## API

| Route | Purpose |
|---|---|
| `POST /api/documents/:id/deadline` | Set or update |
| `DELETE /api/documents/:id/deadline` | Remove |
| `PUT /api/availability` | Minutes per weekday |
| `GET /api/documents/:id/plan` | Full plan, with `feasible` and `shortfallMinutes` |
| `GET /api/plan/today` | Today's plan entries across all courses |
| `POST /api/plan/days/:date/complete` | Mark done |

`GET /api/today`, the composed home view (plan entries plus due cards plus
todos), belongs to `workspace` in M6. During M5, `/api/plan/today` is what the
home screen calls; M6 swaps the call site, not this route.

**`PlanningInputError` maps to 422** on `GET /api/documents/:id/plan` (a
well-formed request the current deadline/availability cannot satisfy at all —
distinct from `feasible: false`, which is a normal **200** response the
frontend renders, not an error state). The React Query layer treats 422 here
as its own case, not the generic error state: same "aucune fiche ne rentre"
messaging tone as `feasible: false`, since both stem from the same
availability-vs-workload mismatch from the user's point of view.

## Out of scope

Reminders and notifications. Calendar export. Todos, which belong to `workspace`.
Any generation.

## Key tests

Property-based, with `fast-check`, over random notion counts, deadlines and
availabilities. Each of the six hard invariants, the conditional one, and the
`shortfallMinutes === 0 ⟺ feasible === true` equivalence, is a property.

- Determinism: call twice, deep-equal the result, including under the
  best-effort (infeasible) path
- Infeasible: 40 hard notions, three days, ten minutes a day, returns
  `Ok(plan)` with `feasible: false`, a correct `shortfallMinutes`, and still
  schedules as much as fits, in notion-position order
- Infeasible, single atomic notion: one `hard` notion whose `learn` minutes
  exceed every day's availability still returns `Ok(plan)` with
  `feasible: false` — not a `PlanningInputError`
- Invalid input: deadline before `now`'s day → `Err({kind: 'deadline-in-past'})`;
  every weekday at 0 minutes → `Err({kind: 'no-capacity'})`; a deadline whose
  window contains no nonzero-capacity weekday occurrence →
  `Err({kind: 'no-usable-day'})` — none of these three ever produce a `Plan`
- No deadline: a steady plan that does not run out
- Missed days: skipping four days redistributes without a backlog and without
  exceeding daily capacity
- Boundary: deadline today; deadline tomorrow
- Architecture: `dependency-cruiser` fails if `planning/**` imports an AI package
- Integration: `GET /api/documents/:id/plan` returns 200 with `feasible: false`
  for an infeasible-but-valid request, and 422 for a `PlanningInputError`
- Playwright: set a deadline two weeks out, see the daily plan, skip a day,
  see it redistribute

## Open questions

- Should availability be per course rather than per user? Simpler as-is, but a
  student with five subjects will want to divide their time. Likely needed once
  more than two courses exist; the table takes a `document_id` column then.
- The minute estimates are guesses. Once `reviews.elapsed_ms` has real data,
  replace the constant table with a per-user median. Do not do this before M7.
