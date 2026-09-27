# Module `content` — M3

## Responsibility

Turning extracted Markdown into **notions**: the atomic units of the course. A
notion is one idea that can be learned, questioned and scheduled independently.

Everything downstream counts notions: generation makes cards per notion, review
schedules per card, progress distributes notions across days, and the progress
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
- Titles are unique within a document, case-insensitive after trimming. A
  title repeated across chunks is resolved deterministically, never by failing
  the document (see [Duplicate titles across chunks](#duplicate-titles-across-chunks))
- 5 to `max(60, ceil(markdownLength / 500))` notions per document
  (`maxNotionCount`). Below 5, splitting probably failed. Above the cap, the
  granularity is too fine and the plan becomes unusable: one notion per 500
  characters of extracted Markdown is the finest accepted, below that a
  "notion" is a sentence. The cap stays 60 up to 30 000 characters (about ten
  dense pages, what the original fixed 60 implicitly assumed) and grows with
  the document beyond: the 43-page A2A course (~65 400 characters after
  cleaning) gets 131. Outside the range, the job fails with a message naming
  the actual bounds rather than writing garbage. Above the cap the failure is
  **terminal** (every chunk is already paid for, and a full re-split of the
  same text overshoots again); below the floor it stays retryable.
- The splitter is told how many notions to aim for per chunk
  (`notionCountTarget`): one per 600 to 1 000 characters of the chunk, and
  never fewer than 5 when the chunk is the whole document. 600 stays coarser
  than the cap's 500, so a model that follows the target is never rejected.
  Why: the first real run on A2A (2026-09-27, 9 chunks of ~7 300 characters,
  no target in the prompt) produced 315 notions, one per ~208 characters —
  2.4x the cap (`docs/reports/long-documents-notions.md`).
- Each chunk also gets a **notion budget** (`notionBudgets`,
  `domain/notion-budget.ts`), named in the prompt as a ceiling ("jamais plus
  de N notions"): the document's cap shared out by largest remainder in
  proportion to each chunk's length, one notion reserved per chunk when the
  cap covers them. The budgets sum to exactly the cap, never more, so a
  model that respects every ceiling cannot fail the cap. The 600-to-1 000
  target stays as the density to aim for, bounded by the budget. A2A: nine
  budgets of 14 or 15.

`difficulty` is a **label**, not a schedule. It is an input to `progress`'s pure
function. Nothing in this module decides when anything is studied.

## Ports

```ts
interface NotionSplitter {
  split(input: {
    markdown: string;
    hint?: { subject?: string; level?: string };
    avoidTitles?: string[]; // titles earlier chunks of the document produced
    targetNotions?: { min: number; max: number }; // notions to aim for in this chunk
    maxNotions?: number; // this chunk's share of the document's cap, a ceiling
  }): Promise<Result<SplitNotion[], SplitError>>;
}

type SplitNotion = { title: string; body: string; difficulty: Difficulty };
type SplitError =
  | { kind: 'model-error'; message: string }
  | { kind: 'invalid-notion-count'; message: string }
  | { kind: 'truncated'; message: string }; // output hit maxTokens: terminal
```

Zod schema notes, per `CLAUDE.md`:

- Keep it flat: an array of three-field objects. No nesting, no unions.
- `.min()` and `.max()` are **not** transmitted to the model. Put the real
  constraints in `.describe()`: `title` is a short noun phrase, `body` is
  self-contained, `difficulty` reflects how hard this is to memorise.
- `.refine()` on the array: titles distinct within the response (checked by
  hand after `generateObject`, see the adapter). The notion-count bounds are a
  document-level check in `handleSplitJob`, not per chunk.

**Chunking.** A long course exceeds what one call can turn into notions: the
output (every notion's self-contained body, as JSON) must fit the splitter's
`maxTokens`. `chunkBySize` (`domain/chunk-by-size.ts`) cuts the Markdown on
paragraph boundaries into chunks of about **10 000 characters** (target),
never above **15 000** (hard max), then the model is called per chunk and
positions are renumbered globally. Headings (`#` to `######`) are preferred
cut points once a chunk is 70% full, never mandatory, and a chunk never ends
on a heading. A fenced code block (```` ``` ```` or `~~~`) is never cut, even
when it alone exceeds the hard max. A last chunk under a quarter of the
target is folded into the previous one when the hard max allows.

Why not headings only (the M3 rule): a 43-page PDF's only `#` lines were
comments in its code samples, giving a 45 767-character first chunk whose
output was truncated. Limitation: PDF extraction is flat text (every line its
own paragraph, code never fenced), so a PDF's code sample can be cut between
two of its lines; only fenced code (docx, photo, typed Markdown) is
protected. `chunkByTopLevelHeadings` (`domain/chunk-markdown.ts`) is no
longer used and kept with its tests as a cleanup candidate.

**`maxTokens` = 16 000** (`infra/claude-notion-splitter.ts`,
`SPLITTER_MAX_TOKENS`), sized against the 15 000-character hard max: French
course text was ~3.5 characters per token on the Sonnet 4.5 tokenizer and
`claude-sonnet-5`'s counts ~30% more, so at a conservative 2.5 a chunk is
≤ ~6 000 input tokens; the self-contained bodies restate context, so assume
output up to 1.5× the input plus ~15% JSON overhead (keys, escaping, titles,
difficulty): ≈ 10 400 tokens; 16 000 leaves ~1.55× headroom, stays far under
`claude-sonnet-5`'s 128K output limit (thinking, adaptive by default on that
model, counts against the same limit), and is the documented comfortable ceiling for a non-streamed
request (`generateObject` does not stream). Without it the provider default
was 4 096.

**Errors.** A schema or refine violation keeps the retry-once-with-feedback
(`CLAUDE.md` rule 4). A truncated output (`finishReason: "length"`, carried by
`NoObjectGeneratedError` or on a result that still parsed) is `truncated`: not
retried by the splitter, and `handleSplitJob` returns it with
`terminal: true`, which `apps/worker` turns into `JobQueue.fail(..., {
terminal: true })` through a `JobQueue` decorator
(`apps/worker/src/terminal-failures.ts`) — the frozen jobs kernel gives
handlers no other way. Every other failure (network, 429/529, 5xx, which the
AI SDK already retries twice itself) stays a `model-error`, retried by the
job with backoff.

### Duplicate titles across chunks

Each chunk's call receives the titles earlier chunks produced
(`avoidTitles`), and the prompt asks the model not to reuse them. When it
does anyway, `disambiguateTitles` (`domain/disambiguate-titles.ts`) resolves
it without another model call: the first occurrence keeps its title, a later
one becomes `Titre (Section)`, the section being the chunk's first heading
outside code (`sectionLabel`), else `Titre (partie N)` (N = chunk number, also
used when the section says the same as the title), then `Titre (Section 2)`,
`(Section 3)`… Uniqueness is case-insensitive after trimming, the result never
exceeds 80 characters (title truncated first, section label capped at 40).
The fixture adapter's `valid` case honours `avoidTitles` too.

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
| `GET /api/notions/statuses` | Notion-step status per document: `[{ documentId, status }]` |
| `POST /api/documents/:id/notions/retry` | Relaunch notion creation only. 202, 403 (another user's or unknown document), 409 (step not failed, or the document already has notions) |

## Notion step status and retry

A document's exposed `status` (ingestion, `packages/contracts`) only covers
extraction. Whether its notions were created is this module's own fact,
served separately — not as a new ingestion status value: contracts are
frozen, and ingestion cannot depend on content (content already depends on
ingestion).

- `listNotionStatuses(userId)` derives, per document, the status of its
  **latest** `split-notions` job (`JobQueue.listJobs`, newest first), via the
  pure `domain/notion-step-status.ts`: `pending`/`running` → `pending` (a job
  waiting out a retry backoff is still in progress), `done` → `ready`,
  `failed` → `failed`. A document with no split job gets no entry: its
  extraction is not done yet. Never derived from the job's error text, and
  `lastError` is never sent to the client (the route's response schema
  strips it).
- `retryNotionSplit(userId, documentId, now)` enqueues a new `split-notions`
  job (`{ documentId }`) only when the document belongs to the caller
  (`not-found` otherwise), its latest split job is `failed` (`not-failed`
  otherwise) and it has no notions (`has-notions` otherwise: a new split
  would replace them with their cards and review history) — mirrors
  ingestion's `retryExtraction`, never re-runs extraction.
- Mes cours and Notions show the step in progress, and on failure a plain
  sentence plus "Réessayer" (this route). A failed latest split never hides
  notions a document already has: the retry is only offered when it has
  none, and the server enforces it. A 409 on retry means the screen is
  stale: it refreshes instead of showing an error.

## Out of scope

Cards, questions, quizzes. Scheduling.

## Key tests

- Unit: position contiguity after insert, delete, reorder and full reversal
- Unit: title uniqueness, case-insensitive and trimmed
- Unit: chunking splits on top-level headings and renumbers globally
  (`chunk-markdown.unit.test.ts`, the pre-size-chunking rule, kept)
- Unit: `chunkBySize` — paragraph-boundary cuts at the target, never above the
  hard max, heading preference at 70%, no chunk ending on a heading, fenced
  code never cut (same fence character, at least as long; unclosed fence runs
  to the end), tiny last chunk folded (`chunk-by-size.unit.test.ts`)
- Unit: `maxNotionCount` / `isValidNotionCount(count, length)`
  (`max-notion-count.unit.test.ts`); `disambiguateTitles` and `sectionLabel`
  (`disambiguate-titles.unit.test.ts`)
- Unit: `handleSplitJob` — size chunking, `avoidTitles` forwarded, a
  repeated title qualified instead of failing, the length-proportional cap
  and its message, `truncated` returned with `terminal: true`, a count above
  the cap terminal and one below the floor retryable, `targetNotions`
  forwarded per chunk (floor of 5 only for a single-chunk document),
  `maxNotions` per chunk summing to the cap
- Unit: `notionCountTarget` (`notion-count-target.unit.test.ts`), bounded by
  the budget; `notionBudgets` (`notion-budget.unit.test.ts`), mutation-tested
- Contract: the 43-page A2A PDF (`tests/fixtures/ingestion/a2a-course.pdf`)
  through the real extractor and chunker: 5 to 12 chunks, none above the hard
  max, no pagination, running header or punctuation-only line
  (`long-pdf-chunking.contract.test.ts`)
- Contract (MSW): explicit `max_tokens`; `stop_reason: "max_tokens"` →
  `truncated` after one call, also when the cut list still parses and when it
  happens on the schema retry; a 400 stays `model-error`; `avoidTitles`,
  `targetNotions` and `maxNotions` in the prompt
- Worker: a terminal split failure goes straight to `failed` through the real
  `runWorkerTick` and `SqliteJobQueue`, any other back to `pending`
  (`apps/worker/src/terminal-failures.{unit,int}.test.ts`)
- Contract: a structured fixture yields 5 to 60 notions with distinct titles; a
  fixture returning 3 notions fails the job with a clear message; a
  schema-violating response retries once then fails
- Integration: FTS5 returns updated text after a `PATCH`, and nothing after a
  delete
- Integration: running the split job twice leaves one set of notions
- Security: another user's notions are absent from search results and return 403

## Open questions

- The 5-to-60 bounds were a guess; the upper one is now length-proportional
  (see Invariants), the 500-characters-per-notion granularity is itself a
  calibration to check against real long courses. The 600–1 000 per-chunk
  target added after the first real A2A run has not been through a paid run
  yet: whether the model follows it is unverified. Revisit against the M3 eval set: if real
  lessons regularly produce 4 notions, the lower bound is wrong, not the lesson.
  First real data point (M3 eval run, 2026-08-27, `evals/results/2026-08-27.md`):
  a deliberately very short, single-theorem lesson (`evals/golden/05-cours-court`)
  landed at exactly 5 notions — right at the floor, not under it. One document is
  not a trend; still worth tracking as more real lessons go through the eval.
- Should editing a notion's body automatically regenerate its cards, or mark them
  stale for the user to confirm? Currently: mark stale, `generation` decides.
