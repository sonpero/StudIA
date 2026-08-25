# Module `content` — M3

## Responsibility

Turning extracted Markdown into **notions**: the atomic units of the course. A
notion is one idea that can be learned, questioned and scheduled independently.

Everything downstream counts notions: generation makes cards per notion, review
schedules per card, planning distributes notions across days, and the progress
ring on the course card is `mastered / total`. Get the granularity wrong here and
every other module inherits the mistake.

## Domain

```ts
type Difficulty = 'easy' | 'medium' | 'hard';

type Notion = {
  id: string;
  documentId: string;
  userId: string;
  title: string;          // 3 to 80 chars, a noun phrase, not a question
  body: string;           // Markdown, self-contained
  difficulty: Difficulty; // model-suggested, user-editable
  position: number;       // order in the course, contiguous from 0
  createdAt: string;
};
```

**Invariants, enforced in `domain/` and tested:**

- Positions are contiguous from 0 with no gaps, and reordering preserves that
- A notion's `body` is self-contained: it must make sense read alone, out of
  order, because that is how it will be reviewed
- Titles are unique within a document, case-insensitive after trimming
- 5 to 60 notions per document. Below 5, splitting probably failed. Above 60, the
  granularity is too fine and the plan becomes unusable. Outside the range, the
  job fails with a message rather than writing garbage.

`difficulty` is a **label**, not a schedule. It is an input to `planning`'s pure
function. Nothing in this module decides when anything is studied.

## Ports

```ts
interface NotionSplitter {
  split(input: {
    markdown: string;
    hint?: { subject?: string; level?: string };
  }): Promise<Result<SplitNotion[], SplitError>>;
}

type SplitNotion = { title: string; body: string; difficulty: Difficulty };
```

Zod schema notes, per `CLAUDE.md`:

- Keep it flat: an array of three-field objects. No nesting, no unions.
- `.min()` and `.max()` are **not** transmitted to the model. Put the real
  constraints in `.describe()`: `title` is a short noun phrase, `body` is
  self-contained, `difficulty` reflects how hard this is to memorise.
- `.refine()` on the array: titles distinct, length between 5 and 60.

**Chunking.** A long course exceeds a comfortable context. Split the Markdown on
top-level headings first, call the model per chunk, then renumber positions
globally. Chunk boundaries follow the document's own structure, which is exactly
why `ingestion` must preserve headings.

## Use cases

- `handleSplitJob(payload, ctx)` — enqueued by `ingestion` on extraction success.
  Reads the extraction, chunks, calls the splitter, validates, writes notions.
  **Idempotent**: deletes existing notions for the document first.
- `listNotions(userId, documentId)`
- `updateNotion(userId, notionId, { title?, body?, difficulty? })`
- `reorderNotions(userId, documentId, orderedIds)` — rejects a partial list
- `deleteNotion(userId, notionId)` — renumbers positions
- `searchNotions(userId, query)` — FTS5, scoped to the user

**Deleting or heavily editing a notion invalidates its cards.** This module emits
the fact; `generation` decides what to do with it. Do not reach into `cards`.

## Persistence

```sql
CREATE TABLE notions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (document_id, position)
);
CREATE INDEX idx_notions_document ON notions(document_id, position);

CREATE VIRTUAL TABLE notions_fts USING fts5(
  title, body, content='notions', content_rowid='rowid'
);
```

FTS5 stays in sync through triggers on insert, update and delete. Write the
triggers with the table, not later: an out-of-sync FTS index fails silently.

Reordering inside one transaction violates `UNIQUE(document_id, position)`
mid-update. Shift positions into a negative range first, then back. Test this
with a reversal of the full list.

## API

| Route | Purpose |
|---|---|
| `GET /api/documents/:id/notions` | List, ordered |
| `PATCH /api/notions/:id` | Edit title, body or difficulty |
| `POST /api/documents/:id/notions/reorder` | Full ordered list of ids |
| `DELETE /api/notions/:id` | Delete and renumber |
| `GET /api/search?q=` | FTS5 across the user's notions |

## Out of scope

Cards, questions, quizzes. Scheduling. Embeddings, which belong to `tutor`.

## Key tests

- Unit: position contiguity after insert, delete, reorder and full reversal
- Unit: title uniqueness, case-insensitive and trimmed
- Unit: chunking splits on top-level headings and renumbers globally
- Contract: a structured fixture yields 5 to 60 notions with distinct titles; a
  fixture returning 3 notions fails the job with a clear message; a
  schema-violating response retries once then fails
- Integration: FTS5 returns updated text after a `PATCH`, and nothing after a
  delete
- Integration: running the split job twice leaves one set of notions
- Security: another user's notions are absent from search results and return 403

## Open questions

- The 5-to-60 bounds are a guess. Revisit against the M3 eval set: if real
  lessons regularly produce 4 notions, the lower bound is wrong, not the lesson.
- Should editing a notion's body automatically regenerate its cards, or mark them
  stale for the user to confirm? Currently: mark stale, `generation` decides.
