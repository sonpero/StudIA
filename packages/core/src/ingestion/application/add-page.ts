import { createHash } from "node:crypto";
import { err, ok, type Result } from "../../shared/index.js";
import { detectSourceType } from "../domain/detect-source-type.js";
import { isAcceptable } from "../domain/is-acceptable.js";
import { nextPageIndex } from "../domain/next-page-index.js";
import type { DocumentRepository, FileStore } from "../domain/ports.js";
import type { Page } from "../domain/types.js";

export interface AddPageDeps {
  repo: DocumentRepository;
  fileStore: FileStore;
}

export type AddPageError = "not-found" | "unsupported" | "too-large" | "duplicate";

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

// Validate, hash, dedupe within the document, store, return the page
// (docs/modules/ingestion.md).
export async function addPage(
  deps: AddPageDeps,
  userId: string,
  documentId: string,
  bytes: Buffer,
  mimeType: string,
  filename: string,
  _now: Date,
): Promise<Result<Page, AddPageError>> {
  const document = await deps.repo.findDocument(userId, documentId);
  if (!document) return err("not-found");

  const sourceType = detectSourceType(mimeType, filename);
  if (!sourceType.ok || sourceType.value !== document.sourceType) return err("unsupported");
  if (!isAcceptable(bytes.length, mimeType)) {
    return err(bytes.length > 20 * 1024 * 1024 ? "too-large" : "unsupported");
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const existing = await deps.repo.findPageBySha256(userId, documentId, sha256);
  if (existing) return err("duplicate");

  const existingPages = await deps.repo.listPages(userId, documentId);
  const index = nextPageIndex(existingPages.map((p) => p.index));
  const ext = EXT_BY_MIME[mimeType] ?? "bin";
  const storedPath = await deps.fileStore.put(userId, documentId, index, bytes, ext);

  const page: Page = { documentId, index, sha256, storedPath, sizeBytes: bytes.length };
  await deps.repo.addPage(userId, page);
  return ok(page);
}
