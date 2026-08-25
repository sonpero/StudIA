# Module `generation` — M3 (flashcards), M4 (MCQ, open questions)

## Responsibility

Producing retrieval-practice items from notions. One notion yields several cards
of different types. This module decides **what is asked**; `review` decides
**when it is asked**.

## Domain

```ts
type CardType = 'flashcard' | 'mcq' | 'open';
type CardState = 'active' | 'stale';   // stale: its notion changed since generation

type Card = {
  id: string;
  notionId: string;
  userId: string;
  type: CardType;
  state: CardState;
  question: string;
  answer: string;              // for mcq, the text of the correct option
  options: string[] | null;    // mcq only, 4 entries including the answer
  createdAt: string;
};
```

**Invariants, enforced in `domain/` and tested:**

- `mcq` has exactly 4 options; the answer is one of them; all four are distinct
  after trimming and case-folding
- `mcq` distractors are plausible: same category, comparable length. Enforced as
  a heuristic (no option shorter than half or longer than twice the median) plus
  measured in the eval, because "plausible" is not fully checkable in code
- `flashcard` and `open` have `options === null`
- Questions do not leak the answer: reject a question containing the answer
  string verbatim
- 1 to 5 cards per notion. `easy` notions get fewer, `hard` more.

The "answer is among the options" check is the single most valuable `.refine()`
in the project. Models get it wrong often enough to matter, and it is free.

## Ports

```ts
interface CardGenerator {
  generate(input: {
    notion: { title: string; body: string; difficulty: Difficulty };
    types: CardType[];
  }): Promise<Result<GeneratedCard[], GenerationError>>;
}
```

Zod, per `CLAUDE.md`:

- **One schema per card type, one call per type.** A discriminated union across
  three shapes degrades reliability badly. Three flat calls beat one clever one.
- Constraints go in `.describe()`, not in `.min()`: a question is one sentence,
  distractors are wrong but believable, the answer is short.
- `.refine()` carries every invariant above. On failure, retry once with the
  validation error fed back, then fail the job.

## Use cases

- `handleGenerationJob(payload, ctx)` — one job per notion, enqueued when the
  user requests generation via the routes below. Generation is NEVER triggered
  automatically after splitting: it costs tokens and the user may want to review
  the notions first.
  Generates the configured types per notion. **Idempotent**: replaces existing
  cards for that notion.
- `generateForNotion(userId, notionId, types, now)` — manual regeneration
- `markStale(userId, notionId)` — called when a notion's body changes
- `listCards(userId, notionId)`
- `deleteCard(userId, cardId)`

**Generation is per notion, one job per notion, not one job per document.** A
30-notion course is 30 jobs. Failure is then isolated to one notion instead of
losing the whole course, progress is reportable as `18 / 30`, and each job stays
short. This is the single most consequential design choice in the module.

**No LLM call inside a transaction.**

## Persistence

```sql
CREATE TABLE cards (
  id TEXT PRIMARY KEY,
  notion_id TEXT NOT NULL REFERENCES notions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('flashcard','mcq','open')),
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active','stale')),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  options_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_cards_notion ON cards(notion_id);
CREATE INDEX idx_cards_user_active ON cards(user_id, state);
```

**Deleting a card cascades to its reviews, which destroys scheduling history.**
Regeneration must therefore replace cards by id where the question is unchanged,
and only insert or delete where it actually differs. Diff before writing.

## API

| Route | Purpose |
|---|---|
| `GET /api/notions/:id/cards` | List |
| `POST /api/notions/:id/generate` | Enqueue generation, body `{ types }` |
| `POST /api/documents/:id/generate` | Enqueue one job per notion |
| `GET /api/documents/:id/generation-status` | `{ done, total, failed }`, derived from `jobs.listJobs('generate-cards')` filtered by `payload.documentId` |
| `DELETE /api/cards/:id` | Delete |

## Out of scope

Scheduling and FSRS. Grading a user's answer, which belongs to `review`. Anything
about when a card is shown.

## Key tests

- Unit: every invariant, each with a passing and a failing case
- Unit: the answer-among-options check catches a generated card where it is absent
- Unit: question-leaks-answer detection
- Contract: fixtures per card type; a fixture whose answer is missing from the
  options triggers exactly one retry then fails; a fixture with duplicate options
  is rejected
- Integration: regenerating a notion whose questions are unchanged preserves the
  card ids, and therefore the review history. **This is the test that protects
  user progress; write it early.**
- Integration: one failed notion job leaves the other 29 successful
- Eval: distractor quality and question clarity on the golden set

## Open questions

- Which types are generated by default? Currently flashcards only in M3, user
  choice in M4. An automatic mix based on difficulty is tempting but unproven.
- Should a stale card still be reviewable? Currently yes, with a visible marker;
  hiding it would silently shrink a user's due list.
