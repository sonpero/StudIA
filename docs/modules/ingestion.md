# Module `ingestion` — M2

## Responsibility

Getting course material into the system: upload, storage on the volume, and
extraction of structured Markdown from photos, PDFs, Word and PowerPoint files.

Ingestion stops at "here is the text". Splitting that text into notions belongs
to `content`.

## Domain

```ts
type SourceType = 'photo' | 'pdf' | 'docx' | 'pptx';
type ExtractionStatus = 'pending' | 'running' | 'done' | 'failed';

type Document = {
  id: string;
  userId: string;
  title: string;            // user-editable, defaults to the filename
  sourceType: SourceType;
  status: ExtractionStatus;
  pageCount: number;        // >= 1; several photos of one lesson are one document
  createdAt: string;
};

type Page = { documentId: string; index: number; sha256: string; storedPath: string; sizeBytes: number };
type Extraction = { documentId: string; markdown: string; extractedAt: string };
```

**Multi-page is the default, not a special case.** A student photographs four
pages of a lesson: that is one `Document` with four `Page` rows, extracted in
order and concatenated into one Markdown body. Modelling a document as a single
file would force a rewrite in M6.

Pure domain functions:

- `detectSourceType(mimeType, filename)` → `Result<SourceType, 'unsupported'>`
- `isAcceptable(sizeBytes, mimeType)` — 20 MB per page, allow-list of MIME types,
  never an extension-only check
- `nextPageIndex(existing)` — contiguous, gapless ordering

## Ports

```ts
interface FileStore {
  put(userId: string, documentId: string, pageIndex: number, bytes: Buffer, ext: string): Promise<string>;
  read(storedPath: string): Promise<Buffer>;
  delete(storedPath: string): Promise<void>;
}

interface DocumentExtractor {
  supports(sourceType: SourceType): boolean;
  extract(input: { bytes: Buffer; sourceType: SourceType }): Promise<Result<string, ExtractionError>>;
}
```

Two adapters implement `DocumentExtractor`:

- **`OfficeParserExtractor`** for pdf, docx, pptx
- **`VisionExtractor`** for photos, via `generateObject` with an output schema of
  `{ markdown: string, legible: boolean, reason?: string }`

`legible: false` is not an error, it is a result. It maps to a user-facing message
telling them to retake the photo with more light, per `docs/UI.md`.

**Extraction output is Markdown with a heading hierarchy preserved.** Headings are
a signal `content` uses to choose where to cut its chunks (preferred, no longer
mandatory: `content` chunks by size). An extractor that returns flat text
has failed even if it returned text, and the contract test asserts heading
presence on a structured fixture.

### Cleaning officeparser's text (`cleanExtractedText`)

`OfficeParserExtractor` runs `cleanExtractedText` (`domain/clean-extracted-text.ts`)
on officeparser's raw text **before** `promoteHeadings`, which would otherwise
promote layout noise to `##` (a 43-page PDF: 861 promoted lines, 43 running
headers, 43 `Page N of 43`, 56 lone commas). Every rule matches a whole line
(trimmed), never a fragment inside a sentence ("1/2 tasse", "voir p. 3" stay):

- **Pagination**: `Page N`, `Page N of|sur|de|/ M`, `p. N`, `N / M`, `N of M`,
  `N sur M` (only when N ≤ M: "5 / 3" is a ratio), `- N -`, `— N —`.
- **Punctuation-only lines** (Unicode punctuation and spaces), except lines
  containing `{ } [ ]`, which close code/JSON structures.
- **Running headers/footers**: a multi-word line repeated identically at least
  `max(3, ceil(0.4 × pageCount))` times. officeparser@4.2.0 flattens all PDF
  pages into one stream (no option exposes page boundaries), so `pageCount` is
  estimated from the pagination markers: the largest declared total (`of M`),
  else the number of markers. No pagination, no header removal (no evidence).
  40%, not 50%: alternating book-style headers each cover about half the pages.
  Multi-word only: a single repeated token (`taskId` ×17 in the A2A course) is
  content. Known misses: a header with a varying number in it ("Chapitre 3 —
  p. 12"), and a table cell "3 / 4" alone on its line is dropped as pagination.

`promoteHeadings` also stops promoting obvious non-headings: a line ending
with a comma, starting with a lowercase letter or a continuation mark
(`, . ; : ) ] }`), or containing no letter. On the A2A course: 861 → 299
promoted lines (still many table cells: officeparser gives no style signal).

## Use cases

- `createDocument(userId, title, sourceType, now)` — the document row, before any file
- `addPage(userId, documentId, bytes, mimeType, now)` — validate, hash, dedupe
  within the document, store, return the page
- `startExtraction(userId, documentId, now)` — enqueue one `extract-document` job
- `handleExtractionJob(payload, ctx)` — read pages in order, run the right
  extractor per page, concatenate, write `extractions`, set status
- `retryExtraction(userId, documentId, now)` — only from `failed`
- `getDocument`, `listDocuments`, `readPageFile`
- `cleanupAbandonedDocuments(payload, ctx)` — a `cleanup-abandoned-documents`
  job handler, scoped to `ctx.userId`: deletes, via the exact same path as
  `deleteDocument`, every one of that user's documents that has **no**
  `extract-document` job at all and is at least `ABANDONED_DOCUMENT_THRESHOLD_MS`
  (30 minutes) old
- `scheduleAbandonedDocumentCleanup(now)` — fan-out: reads every distinct
  document owner via `DocumentRepository.listDistinctUserIds()` and enqueues one
  `cleanup-abandoned-documents` job per owner

**The extraction handler must be idempotent**: it deletes any existing
extraction row for the document before inserting. A job that runs twice after a
worker restart must not produce two extractions.

**No LLM call inside a transaction.** Read the page list, close the transaction,
call the extractor, then open a short write transaction.

### Abandoned-document cleanup (server-side safety net)

The upload flow is two-phase by design (`createDocument`, then `addPage` per
file, then `startExtraction`): the document row exists before any file is
attached. When the confirmation is refused on screen — a page rejected as a
duplicate — `UploadCard.tsx` rolls that document back with a `DELETE
/api/documents/:id` call. That call is **best-effort**: a closed tab or a
dropped connection at exactly the wrong moment leaves the document behind with
no `extract-document` job ever enqueued for it. Because `listDocuments` and
`getDocument` fall back to the raw `documents.status` column (`pending`, set at
creation and never updated) whenever no job exists, such a document is
indistinguishable in the UI from one about to be processed, and stays stuck
"en attente" forever.

`cleanupAbandonedDocuments` is the server-side backstop for that gap: a job,
typed in the existing `jobs` table exactly like `extract-document`, rather than
an unfiltered `DocumentRepository` method — every row it touches is still read
and deleted through `ctx.userId`-scoped calls. `scheduleAbandonedDocumentCleanup`
is the one deliberate exception to "every method takes `userId`"
(`DocumentRepository.listDistinctUserIds()`): it only decides *who* to run the
job for, never reads or acts on another user's data itself.

Cadence lives in `apps/worker`, not in the job itself: `jobs/**` has no
cron/scheduling primitive (`docs/modules/jobs.md`, "Out of scope"), and
`enqueue()` always sets `run_after = now`, so a job cannot delay its own first
run either. The worker calls `scheduleAbandonedDocumentCleanup` once at
startup (same pattern as `recoverStaleJobs`) and then every 30 minutes via a
plain `setInterval`.

**30 minutes, not the 5 minutes used for a one-off manual diagnostic query**: a
slow multi-photo upload, or a tab left open mid-upload, can legitimately take
longer than a few minutes. An unsupervised job deleting a document still being
built would be a worse bug than the one it fixes.

## Persistence

```sql
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('photo','pdf','docx','pptx')),
  status TEXT NOT NULL CHECK (status IN ('pending','running','done','failed')),
  colour TEXT NOT NULL,                    -- subject colour, see docs/UI.md
  created_at TEXT NOT NULL
);

CREATE TABLE pages (
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_index INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  PRIMARY KEY (document_id, page_index),
  UNIQUE (document_id, sha256)             -- same photo twice in one document is rejected
);

CREATE TABLE extractions (
  document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  markdown TEXT NOT NULL,
  extracted_at TEXT NOT NULL
);
```

Files live at `DATA_DIR/uploads/{userId}/{documentId}/{pageIndex}.{ext}`.
Deleting a document deletes its directory; that cleanup is part of the delete use
case, not a cron.

## API

| Route | Purpose |
|---|---|
| `POST /api/documents` | Create a document, returns its id |
| `POST /api/documents/:id/pages` | Multipart, one page. Repeat per photo. |
| `POST /api/documents/:id/extract` | Enqueue extraction |
| `GET /api/documents` | List, with status and colour |
| `GET /api/documents/:id` | Detail, including extraction status and `lastError` |
| `GET /api/documents/:id/pages/:index/file` | Authenticated file read |
| `POST /api/documents/:id/retry` | Re-enqueue after failure |
| `DELETE /api/documents/:id` | Row, pages, files |

**Files are never served statically.** Every read goes through the route above,
which verifies ownership first. Set `Content-Disposition: inline` and an explicit
`Content-Type`; never echo the uploaded MIME type back.

## Out of scope

Notion splitting. Card generation. OCR of handwriting beyond what the vision model
does. Editing extracted text (M3 decides whether that is needed).

## Key tests

- Unit: MIME detection including a `.pdf` that is actually a PNG; size limits;
  page ordering; duplicate-page rejection
- Unit: `cleanExtractedText` — each pagination form, whole-line only, N ≤ M;
  punctuation-only lines but not code brackets; running headers at 40% of the
  pages, minimum 3, multi-word, declared total vs marker count, nothing
  without pagination (`clean-extracted-text.unit.test.ts`); `promoteHeadings`'
  non-heading shapes (`promote-headings.unit.test.ts`)
- Contract: the 43-page A2A PDF (`tests/fixtures/ingestion/a2a-course.pdf`,
  1.5 MB) extracts with no `Page N of 43`, no running header and no
  punctuation-only line (`office-parser-extractor-long-pdf.contract.test.ts`)
- Contract: officeparser on a docx fixture returns headings; vision fixture
  returns Markdown; an illegible fixture returns `legible: false` and a reason;
  a schema-violating response triggers exactly one retry then fails the job
- Integration: upload writes file and row; worker picks the job up; status
  transitions are visible over the API
- Integration: running the handler twice leaves exactly one extraction row
- Security: another user gets 403 on the file route, on detail, and on delete
- Playwright: upload three photos as one document, watch status reach `terminé`,
  read the text; and the failure path with a retry
- Integration: a course refused on screen for a duplicate page, followed by a
  second valid course, does not leave the refused one stuck "pending" with no
  job (`apps/api/src/routes/documents.int.test.ts`)
- Unit: `UploadCard` rolls its document back with a `DELETE` call when the
  confirmation is refused, and a later valid upload is unaffected
  (`apps/web/src/components/UploadCard.unit.test.tsx`)
- Unit: `isAbandonedDocument` — not abandoned below the threshold or with a
  job at any age, abandoned once both conditions hold
- Integration: `cleanupAbandonedDocuments` removes a document created
  directly in the DB (simulating a post-crash orphan) past the threshold,
  and its files, the same way `deleteDocument` does; a document created
  within the threshold, or one with an `extract-document` job at any age,
  is never touched (`cleanup-abandoned-documents.int.test.ts`)

## Open questions

- Should the user be able to edit extracted text before splitting? It would fix
  bad OCR cheaply, but adds an edit screen and a versioning question. Deferred
  until the M3 eval shows how often extraction is wrong.
