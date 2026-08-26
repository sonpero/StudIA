import { mkdir, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FileStore } from "../domain/ports.js";

// Files live at DATA_DIR/uploads/{userId}/{documentId}/{pageIndex}.{ext}
// (docs/modules/ingestion.md). storedPath is relative to dataDir, never
// absolute: the DB should not carry filesystem layout details.
export class LocalFileStore implements FileStore {
  constructor(private readonly dataDir: string) {}

  async put(userId: string, documentId: string, pageIndex: number, bytes: Buffer, ext: string): Promise<string> {
    const relativeDir = path.join("uploads", userId, documentId);
    await mkdir(path.join(this.dataDir, relativeDir), { recursive: true });
    const relativePath = path.join(relativeDir, `${String(pageIndex)}.${ext}`);
    await writeFile(path.join(this.dataDir, relativePath), bytes);
    return relativePath;
  }

  read(storedPath: string): Promise<Buffer> {
    return readFile(path.join(this.dataDir, storedPath));
  }

  async delete(storedPath: string): Promise<void> {
    const fullPath = path.join(this.dataDir, storedPath);
    await rm(fullPath, { force: true });
    // Deleting a document deletes its directory (docs/modules/ingestion.md):
    // best-effort cleanup once it's empty, e.g. after every page of a
    // document has been removed. rmdir fails (harmlessly) if other pages
    // still live there, or if it's already gone.
    try {
      await rmdir(path.dirname(fullPath));
    } catch {
      // not empty, or already gone — both fine.
    }
  }
}
