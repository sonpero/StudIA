import { err, ok, type Result } from "../../shared/index.js";
import type { DocumentRepository, FileStore } from "../domain/ports.js";
import type { Page } from "../domain/types.js";

export interface ReadPageFileDeps {
  repo: DocumentRepository;
  fileStore: FileStore;
}

export async function readPageFile(
  deps: ReadPageFileDeps,
  userId: string,
  documentId: string,
  pageIndex: number,
): Promise<Result<{ bytes: Buffer; page: Page }, "not-found">> {
  const page = await deps.repo.getPage(userId, documentId, pageIndex);
  if (!page) return err("not-found");

  const bytes = await deps.fileStore.read(page.storedPath);
  return ok({ bytes, page });
}
