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
}): Plan;

type Availability = Record<'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun', number>;

type Plan = {
  days: PlanDay[];
  feasible: boolean;              // false when the deadline cannot be met
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
```

**Rules the function must satisfy, all property-tested:**

1. Every notion appears at least once as `learn` before the deadline
2. No day exceeds its availability
3. Nothing is scheduled before `now` or after the deadline
4. A notion's first `review` falls at least one day after its `learn`
5. `hard` notions get more total minutes than `easy` ones
6. Reviews cluster toward the deadline: the last three days are review-only
7. **Determinism**: identical inputs always produce an identical plan. Assert it
   explicitly with a repeated call.

**Infeasibility is reported, not hidden.** When the work does not fit, return
`feasible: false` with the shortfall. Never silently overfill a day, and never
drop notions to make the numbers work. The UI states the fact plainly and offers
options; per `docs/UI.md` it does not scold.

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
- `getPlan(userId, documentId, now)` — computes and returns; does not persist the
  computation
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

`GET /api/today`, the composed home view (plan entries plus due cards plus
todos), belongs to `workspace` in M6. During M5, `/api/plan/today` is what the
home screen calls; M6 swaps the call site, not this route.
| `POST /api/plan/days/:date/complete` | Mark done |

## Out of scope

Reminders and notifications. Calendar export. Todos, which belong to `workspace`.
Any generation.

## Key tests

Property-based, with `fast-check`, over random notion counts, deadlines and
availabilities. Each of the seven rules above is a property.

- Determinism: call twice, deep-equal the result
- Infeasible: 40 hard notions, three days, ten minutes a day, returns
  `feasible: false` with a correct shortfall and still schedules something
- No deadline: a steady plan that does not run out
- Missed days: skipping four days redistributes without a backlog and without
  exceeding daily capacity
- Boundary: deadline today; deadline tomorrow; deadline in the past
- Architecture: `dependency-cruiser` fails if `planning/**` imports an AI package
- Playwright: set a deadline, see the plan, skip a day, see it redistribute

## Open questions

- Should availability be per course rather than per user? Simpler as-is, but a
  student with five subjects will want to divide their time. Likely needed once
  more than two courses exist; the table takes a `document_id` column then.
- The minute estimates are guesses. Once `reviews.elapsed_ms` has real data,
  replace the constant table with a per-user median. Do not do this before M7.
