import { err, ok, type Result } from "../../shared/index.js";
import type { DocumentRepository, FileStore } from "../domain/ports.js";

export interface DeleteDocumentDeps {
  repo: DocumentRepository;
  fileStore: FileStore;
}

// Deleting a document deletes its directory; that cleanup is part of the
// delete use case, not a cron (docs/modules/ingestion.md).
export async function deleteDocument(deps: DeleteDocumentDeps, userId: string, documentId: string): Promise<Result<void, "not-found">> {
  const deletedPages = await deps.repo.deleteDocument(userId, documentId);
  if (!deletedPages) return err("not-found");

  for (const page of deletedPages) {
    await deps.fileStore.delete(page.storedPath);
  }
  return ok(undefined);
}
