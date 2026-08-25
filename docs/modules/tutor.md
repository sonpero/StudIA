# Module `tutor` — M8

## Responsibility

A chat scoped to one course. The user asks a question, the app answers **from the
course content**, with citations pointing back to notions.

The value here is not conversational fluency, it is groundedness. A tutor that
answers plausibly from general knowledge instead of from the lesson is worse than
no tutor, because a student cannot tell the difference and the exam follows the
lesson.

## Domain

```ts
type Chunk = {
  id: string;
  notionId: string;
  documentId: string;
  userId: string;
  text: string;
  embedding: Float32Array;
};

type Citation = { notionId: string; notionTitle: string; snippet: string };

type Answer = {
  text: string;
  citations: Citation[];
  grounded: boolean;      // false when nothing relevant was retrieved
};

type Message = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  citationsJson: string | null;
  createdAt: string;
};
```

**Chunking.** One chunk per notion by default; notions are already atomic, which
is the payoff for getting `content` right. Split only notions whose body exceeds
roughly 1500 characters, on paragraph boundaries, with the notion title prepended
to each chunk so an isolated chunk retains context.

**Hybrid retrieval, in `domain/`, pure and testable:**

```ts
function fuseResults(
  vector: { chunkId: string; score: number }[],
  fts: { chunkId: string; score: number }[],
  k: number
): string[];
```

Reciprocal rank fusion, `1 / (60 + rank)`. Vector search alone misses exact terms
that matter in a lesson (a formula name, a date, a proper noun); FTS5 alone
misses paraphrase. The fusion function is pure arithmetic and gets unit tests
with hand-built rankings.

**Refusal is a first-class outcome.** When the top fused score is below threshold,
`grounded: false` and the app says the course does not cover it, offering to
search the whole library instead. No model call is needed to decide this: it is a
threshold on retrieval, checked before generating.

## Ports

```ts
interface Embedder {
  embed(texts: string[]): Promise<Result<Float32Array[], EmbedError>>;
}

interface ChatModel {
  stream(input: {
    question: string;
    context: { notionId: string; title: string; text: string }[];
    history: { role: 'user' | 'assistant'; content: string }[];
  }): AsyncIterable<string>;
}
```

The chat port streams text rather than returning a structured object, because
`generateObject` cannot stream and a non-streamed answer feels broken. Citations
are therefore **not** parsed out of the model's output: the context passed in is
already a known list of notions, and the citations returned are the retrieved
notions, in retrieval order. Never ask the model to emit citation markers and
never parse them back; that is the standard way this feature breaks.

The system prompt instructs the model to answer only from the provided context
and to say so when the context is insufficient. Verify this with an adversarial
eval case rather than trusting the instruction.

## Use cases

- `handleEmbeddingJob(payload, ctx)` — enqueued lazily by `tutor` itself when a
  conversation is created on a document whose chunks are missing or stale.
  Staleness is detected by comparing each chunk's stored `body_sha256` against
  the current notion body. `content` never knows this module exists; no
  cross-module enqueue. While the job runs, the conversation shows a
  "préparation du cours" state per `docs/UI.md` async rules.
  **Idempotent**: replaces chunks for the notion.
- `ask(userId, documentId, question, conversationId, now)` — embed the question,
  hybrid retrieve, threshold check, stream, persist both messages
- `listConversations`, `getConversation`, `deleteConversation`

**Retrieval is always filtered by `userId` and `documentId` in the SQL, not after
the fact.** A vector index that returns another user's chunks and gets filtered
in application code is one refactor away from a leak.

## Persistence

```sql
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  notion_id TEXT NOT NULL REFERENCES notions(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  text TEXT NOT NULL,
  body_sha256 TEXT NOT NULL          -- hash of the source notion body, for staleness
);
CREATE INDEX idx_chunks_scope ON chunks(user_id, document_id);

CREATE VIRTUAL TABLE chunks_vec USING vec0(
  chunk_id TEXT PRIMARY KEY,
  embedding FLOAT[1536]
);

CREATE VIRTUAL TABLE chunks_fts USING fts5(text, content='chunks', content_rowid='rowid');

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
  citations_json TEXT,
  created_at TEXT NOT NULL
);
```

`chunks_vec` is a `sqlite-vec` virtual table and **does not cascade** when a chunk
is deleted. Delete from it explicitly in the same transaction. This is the most
likely source of silent staleness in the module: orphaned vectors keep being
retrieved and point at rows that no longer exist.

The embedding dimension must match the configured model. Store the model name in
a metadata row and fail loudly at startup on a mismatch, rather than silently
retrieving nonsense.

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

## Key tests

- Unit: reciprocal rank fusion on hand-built rankings, including no overlap and
  full overlap
- Unit: threshold decides `grounded` correctly at the boundary
- Contract: embedding fixtures; a chat fixture streams chunk by chunk; a stream
  that fails midway persists a partial message
- Integration: retrieval SQL filters by `user_id` and `document_id`. Seed two
  users with identical courses and assert zero cross-contamination.
- Integration: deleting a notion removes its chunks **and** its vectors
- Integration: a dimension mismatch fails at startup, not at query time
- Eval: groundedness on the golden set, plus adversarial questions the course
  does not cover, which must be refused

## Open questions

- Should the tutor see the user's review history to target weak notions? Powerful,
  but it turns a scoped Q&A into a system that judges the user, which cuts against
  the unhurried, non-judgemental positioning. Not before M8 ships plainly.
- Embedding model choice, and whether the cost of re-embedding on a model change
  is acceptable. Store the model name from day one either way.
