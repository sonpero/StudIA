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
the signal `content` uses to split notions. An extractor that returns flat text
has failed even if it returned text, and the contract test asserts heading
presence on a structured fixture.

## Use cases

- `createDocument(userId, title, sourceType, now)` — the document row, before any file
- `addPage(userId, documentId, bytes, mimeType, now)` — validate, hash, dedupe
  within the document, store, return the page
- `startExtraction(userId, documentId, now)` — enqueue one `extract-document` job
- `handleExtractionJob(payload, ctx)` — read pages in order, run the right
  extractor per page, concatenate, write `extractions`, set status
- `retryExtraction(userId, documentId, now)` — only from `failed`
- `getDocument`, `listDocuments`, `readPageFile`

**The handler must be idempotent**: it deletes any existing extraction row for
the document before inserting. A job that runs twice after a worker restart must
not produce two extractions.

**No LLM call inside a transaction.** Read the page list, close the transaction,
call the extractor, then open a short write transaction.

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
- Contract: officeparser on a docx fixture returns headings; vision fixture
  returns Markdown; an illegible fixture returns `legible: false` and a reason;
  a schema-violating response triggers exactly one retry then fails the job
- Integration: upload writes file and row; worker picks the job up; status
  transitions are visible over the API
- Integration: running the handler twice leaves exactly one extraction row
- Security: another user gets 403 on the file route, on detail, and on delete
- Playwright: upload three photos as one document, watch status reach `terminé`,
  read the text; and the failure path with a retry

## Open questions

- Should the user be able to edit extracted text before splitting? It would fix
  bad OCR cheaply, but adds an edit screen and a versioning question. Deferred
  until the M3 eval shows how often extraction is wrong.
