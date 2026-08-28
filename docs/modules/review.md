# Module `review` — M3 (flashcards, FSRS), M4 (grading)

## Responsibility

Spaced repetition. When a card is due, what happens when the user rates it, and
what "mastered" means. This is the heart of the product's learning value, and it
is entirely deterministic.

## Domain

```ts
type Rating = 1 | 2 | 3 | 4;   // again, hard, good, easy

type CardSchedule = {
  cardId: string;
  userId: string;
  due: string;          // ISO
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  lastReviewedAt: string | null;
};

type Review = {
  id: string;
  cardId: string;
  userId: string;
  rating: Rating;
  reviewedAt: string;
  elapsedMs: number;
};
```

`ts-fsrs` is wrapped in `domain/scheduler.ts` and **never imported anywhere else**.
The wrapper is a pure function:

```ts
function schedule(current: CardSchedule | null, rating: Rating, now: Date): CardSchedule;
```

`now` is always injected. Nothing in this module calls `new Date()`. That single
rule is what makes "review a card, then assert its due date is 3 days out"
testable without freezing the system clock.

**Mastery.** A card is mastered when `stability >= 21 days` and `reps >= 3`. A
notion is mastered when all its active cards are. The course progress ring is
`masteredNotions / totalNotions`, and that fraction is always shown as a number
per `docs/UI.md`. Define the threshold in one place; several modules read it.

**No urgency.** Overdue is a fact, not an alarm. The domain exposes
`daysOverdue`, and the UI renders it in `--warning`, never `--accent`, and never
with a countdown. Per `docs/UI.md`, this is a product rule.

## Ports

M3 has no LLM port at all; scheduling is pure arithmetic. M4 adds one:

```ts
interface AnswerGrader {
  grade(input: {
    question: string;
    expected: string;
    given: string;
  }): Promise<Result<{ correct: boolean; feedback: string; suggestedRating: Rating }, GradeError>>;
}
```

Used for `open` cards only. `mcq` is graded by exact option match in `domain/`,
never by a model. `suggestedRating` is a **suggestion**: the user can override it,
because a model marking a correct answer wrong and silently damaging the schedule
is the worst failure mode here.

## Use cases

- `getDueCards(userId, now, { documentId?, limit? })` — due first, then new,
  ordered by notion position. Deleting a notion cascades to its cards, so they
  can never appear here; `stale` cards ARE included, marked as such, per the
  `generation` open question.
- `startSession(userId, now, filter)` — creates a session, draws its cards
- `submitReview(userId, cardId, rating, elapsedMs, now)` — writes the review,
  recomputes the schedule, both in one short transaction
- `gradeAnswer(userId, cardId, given)` — M4, the single entry point for both
  mcq (exact match, `domain/grade-mcq.ts`, never a model) and open (calls the
  port outside any transaction). The server is the source of truth for the
  rating either way; the client never grades on its own.
- `getProgress(userId, documentId)` — `{ mastered, total }`
- `abandonSession(userId, sessionId)` — answered cards keep their reviews

**Sessions are not fixed-length.** No target count, no timer, no "session
complete" pressure. The user reviews until they stop, and leaving mid-session
loses nothing. This follows directly from the all-ages, unhurried positioning.

## Persistence

```sql
CREATE TABLE card_schedules (
  card_id TEXT PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  due TEXT NOT NULL,
  stability REAL NOT NULL,
  difficulty REAL NOT NULL,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  last_reviewed_at TEXT
);
CREATE INDEX idx_schedules_due ON card_schedules(user_id, due);

CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 4),
  reviewed_at TEXT NOT NULL,
  elapsed_ms INTEGER NOT NULL
);
CREATE INDEX idx_reviews_card ON reviews(card_id, reviewed_at DESC);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT
);
```

`reviews` is an append-only log. The schedule is derived state and could be
rebuilt from it; keep it that way, because it makes an FSRS parameter change
recoverable instead of destructive.

## API

| Route | Purpose |
|---|---|
| `GET /api/review/due?documentId=&limit=` | Due and new cards |
| `POST /api/review/sessions` | Start a session |
| `POST /api/review/cards/:id` | `{ rating, elapsedMs }`, returns the new schedule |
| `POST /api/review/cards/:id/grade` | M4, `{ given }`, mcq and open (never flashcard, which is self-rated) |
| `GET /api/documents/:id/progress` | `{ mastered, total }` |

## Out of scope

Deciding what to generate. Building a plan, which belongs to `planning`, though
planning reads this module's due counts through its `index.ts`.

## Key tests

- Unit: all four ratings from a fresh card, and from an established one, with an
  injected `now`. Assert exact due dates.
- Unit: the same card, same rating, same `now` always yields the same schedule
- Unit: a lapse increments `lapses` and shortens stability
- Unit: mastery threshold at the boundary, on both sides
- Integration: `getDueCards` respects the clock, `user_id`, and excludes deleted notions
- Integration: submitting a review writes both rows in one transaction, and a
  failure rolls both back
- Integration: abandoning a session preserves answered reviews
- Contract (M4): grader fixtures including a correct answer phrased differently
  from the expected one, which must not be marked wrong
- Playwright: review a card, verify the next due date changed; leave mid-session
  and return

## Open questions

- Default FSRS parameters, or per-user optimisation from review history? Start
  with defaults; optimisation needs hundreds of reviews to mean anything.
- Should `open` answers be gradable offline when the model is unavailable?
  Currently the card is skippable and the user self-rates.
