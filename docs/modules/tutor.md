# Module `tutor` — M8

## Responsibility

A chat scoped to one course. The user asks a question, the app answers **from the
course content**, with citations pointing back to the source text.

The value here is not conversational fluency, it is groundedness. A tutor that
answers plausibly from general knowledge instead of from the lesson is worse than
no tutor, because a student cannot tell the difference and the exam follows the
lesson.

**No retrieval index.** A course of a few dozen pages fits entirely in the
model's context window. Loading the full source markdown is simpler, faster,
and the model cannot miss a passage a search step ranked poorly — there is no
search step. This replaces an earlier design built on `sqlite-vec` embeddings
and FTS5 hybrid retrieval; nothing in this file below refers to that design.

## Domain

```ts
type Section = { index: number; text: string };
// Ephemeral. Computed fresh from the document's markdown on every `ask` call,
// never persisted, never given a stable cross-request id. Splitting a few
// thousand characters of markdown is cheap; there is nothing here worth
// caching, and nothing here that can go stale.

type Citation = { text: string };
// A snippet, captured verbatim from a `Section.text` at the moment the answer
// was generated, then persisted with the message. Never a live pointer to a
// section index: section numbering is only meaningful within one `ask` call,
// and a citation must still resolve correctly if the document is re-extracted
// later and the numbering shifts.

type Answer = {
  text: string;
  citations: Citation[];
  grounded: boolean; // true iff citations is non-empty
};

type Message = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  citationsJson: string | null; // Citation[] snapshot, resolved once, never recomputed
  createdAt: string;
};
```

**Splitting, in `domain/`, pure and testable:**

```ts
function splitIntoSections(markdown: string, minSize?: number): string[];
```

Split on markdown paragraph boundaries (blank line). A fragment shorter than
`minSize` (default 80 characters) is never promoted to its own section: it is
merged into the fragment that follows it, except when it is the last fragment
in the document, in which case it merges into the one before it instead.

The 80-character default was measured, not guessed, on the five documents in
`evals/golden/`: every heading-on-its-own-line fragment there is at most 57
characters, every real body paragraph is at least 77. A default of 80 cleanly
separates the two populations with margin. Merging forward means a lone
heading joins its own body (`## Définition` + the paragraph under it), which
reads correctly; the backward fallback exists only so the very last fragment
of a document is never left stranded below the threshold. Measured, on the
same five documents, section counts before/after this merge:

| document | paragraphs | sections |
|---|---|---|
| 01-svt-photosynthese | 13 | 6 |
| 02-histoire-revolution | 15 | 7 |
| 03-maths-fonctions | 13 | 6 |
| 04-anglais-slides | 13 | 6 |
| 05-cours-court | 3 | 2 |

This function is a duplicate of `content`'s `chunkByTopLevelHeadings`
(`packages/core/src/content/domain/chunk-markdown.ts`) in spirit only, not in
code: that one exists to keep a long course under the notion-splitter's
context budget and only ever splits on top-level headings, which degenerates
to a single chunk on a document with no subheadings (`05-cours-court` above
would be one chunk under that rule — useless as a citation anchor, which is
why this module does not reuse it). The two will diverge further if this
module's granularity needs change; duplicating a twenty-line pure function
across a module boundary costs less than a shared abstraction neither module
actually wants to keep in sync.

**Refusal has no threshold to check.** There is no retrieval score to test
before generating, because there is no retrieval. The system prompt instructs
the model to answer only from the sections provided and to say so plainly when
the course does not cover the question. This is strictly less deterministic
than a threshold and is verified by eval, not by a unit test — see Key tests.
`Answer.grounded` is derived after the fact, from whether the citation step
below found anything to point at, not from parsing the model's prose for
refusal language: `grounded = citations.length > 0`. This keeps the same
meaning the field always had ("nothing relevant was found to answer from") and
gives a safety net independent of whether the model's wording actually reads
as a refusal — an answer that ignores the instruction and drifts into general
knowledge still ends up `grounded: false` if it cites nothing real.

## Ports

```ts
interface ChatModel {
  stream(input: {
    question: string;
    sections: Section[];
    history: { role: 'user' | 'assistant'; content: string }[];
  }): AsyncIterable<string>;
}

interface CitationExtractor {
  extract(input: {
    answer: string;
    sections: Section[];
  }): Promise<Result<{ sectionIndexes: number[] }, ExtractError>>;
}
```

The chat port streams text rather than returning a structured object, because
`generateObject` cannot stream and a non-streamed answer feels broken. Citations
are therefore **not** parsed out of the model's streamed output: never ask the
model to emit citation markers and never parse them back; that is the standard
way this feature breaks.

Because there is no retrieval step to hand back "the sections that were used"
for free the way retrieval order used to, grounding which sections actually
support the answer now requires its own model call after the stream completes:
`CitationExtractor.extract` is a second, non-streamed `generateObject` call,
given the full answer and the same closed list of sections, returning the
indexes it relied on. This is a real added cost this design did not have
before — worth naming plainly rather than treating citations as free.

Output is validated against `z.number().int().min(0).max(sections.length - 1)`
per index: an out-of-range index is a schema violation like any other, retried
once with the error fed back per the project-wide rule. If it still fails
after the retry, the answer is **not** discarded — the streamed text already
reached the user — the message is persisted with `citations: []` and therefore
`grounded: false`, the same as a genuine refusal. A citation snippet is never
generated text: it is `sections[i].text` (or a bounded prefix of it), sliced
server-side from what was actually sent to the model, so a citation cannot
name a passage that was not literally there.

## Use cases

- `ask(userId, documentId, question, conversationId, now)`:
  1. Load the document via `ingestion.getDocument(userId, documentId)`. This is
     the sole and sufficient scoping gate: it returns `not-found` for a
     document that does not belong to the user, and its result already
     supplies the source markdown — there is no second, tutor-owned read path
     to the course, so there is nothing else that could leak another user's
     content. `content` is not consulted at all: notions are a reformulated,
     lossy view of the course, kept for revision, not a substitute for the
     source text.
  2. If extraction is not `done` or `markdown` is null, refuse the same way
     the reader screen already does for that state (`docs/UI.md`) — reuse its
     copy, do not invent a tutor-specific "préparation du cours" state. There
     is no async prep job in this module: splitting is pure and cheap enough
     to run inline on every call, so nothing needs to run ahead of time.
  3. `splitIntoSections` the markdown.
  4. `ChatModel.stream` with the question, the sections, and the conversation
     history; persist tokens as they arrive so a mid-stream failure still
     leaves a partial, marked message rather than nothing.
  5. Once the stream completes, `CitationExtractor.extract` the answer against
     the same sections; slice snippets server-side from the returned indexes.
  6. Persist both messages (`grounded` derived as above) in one short write
     transaction, opened only after both model calls have returned — never
     across an `await` on either.
- `listConversations`, `getConversation`, `deleteConversation` — unchanged,
  each filtered by `userId`.

## Persistence

```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  citations_json TEXT, -- Citation[] snapshot: {text}[], resolved once at write
                        -- time from that call's sections, never recomputed
                        -- against a later re-split of the document
  created_at TEXT NOT NULL
);
```

No `chunks`, no vector table, no FTS virtual table, no embedding-dimension
metadata row: nothing here is precomputed, so nothing here can go stale.

## API

| Route | Purpose |
|---|---|
| `POST /api/documents/:id/conversations` | Start |
| `GET /api/conversations/:id` | History |
| `POST /api/conversations/:id/messages` | Ask; responds as an SSE stream |
| `DELETE /api/conversations/:id` | Delete |

Streaming is Server-Sent Events. If the stream fails mid-answer, persist what
arrived and mark the message partial; never leave the UI with a half message and
no state.

## Out of scope

Answering across several courses at once. Web search. Voice. Generating cards
from a conversation, which belongs to `generation` if it is ever wanted.

Mapping a cited section back to a notion, for display ("this is close to your
fiche X"). Plausible later addition, deliberately not in the first commit: the
tutor must work correctly without it, and a best-effort mapping is exactly the
kind of convenience that quietly becomes trusted as ground truth. If it is
added, document it explicitly as decorative — it must never be the mechanism
that decides what a citation points to; that stays `sections[i].text`, always.

## Key tests

- Unit: `splitIntoSections` — paragraph boundaries; a fragment below `minSize`
  merges into the one that follows; the last fragment of a document merges
  into the one before it when it alone is undersized; a document with a title
  but no subheadings still yields more than one section; same markdown always
  yields the same sections (determinism, no hidden dependency on anything but
  the input string)
- Unit: `grounded` is true iff `citations` is non-empty, including the
  boundary at zero
- Contract: a chat fixture streams chunk by chunk; a stream that fails midway
  persists a partial message; a citation-extraction fixture returns an
  out-of-range index and fails validation, is retried once, then falls back to
  `citations: []` rather than discarding the already-streamed answer
- Integration: `ask` never reads another user's document — seed two users with
  identical course text under different `documentId`s and assert the sections
  built for user A's call come only from A's `ingestion.getDocument` result
- Integration: asking on a document that is still extracting or failed shows
  the same state the reader screen shows for that document, not a separate one
- Eval: groundedness on the golden set
- Eval: refusal rate on adversarial questions — out-of-scope entirely, and
  specifically a question on a subject the golden set covers under a
  *different* document than the one asked about, which is the case a
  threshold used to catch mechanically and a prompt now has to catch on its
  own. Re-run this eval on every system-prompt change, not once at launch —
  the instruction can drift on a model change with no code change to flag it.

## Open questions

- Should the tutor see the user's review history to target weak notions? Powerful,
  but it turns a scoped Q&A into a system that judges the user, which cuts against
  the unhurried, non-judgemental positioning. Not before M8 ships plainly.
- Section-count scaling on a genuinely long course. The 80-character default
  and the merge rule above are measured on `evals/golden/`'s five documents,
  the longest of which is 2 649 characters (~660 tokens) — none of them is the
  "very long" course `docs/TESTING.md` already calls for in the golden set,
  and that document does not exist yet. Extrapolating linearly from the
  measured paragraph sizes, a 40 000-character course could yield on the order
  of 250-300 sections. That is not a context-budget problem — the whole course
  still fits easily — it is a risk that `CitationExtractor` cannot reliably
  pick the right index out of a list that long. Do not address this
  preemptively. Revisit once `evals/golden/` has that long document and the
  eval can measure citation accuracy directly instead of extrapolating, or
  once a real course is observed misciting in practice.
