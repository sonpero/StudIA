import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalFileStore } from "./local-file-store.js";

describe("LocalFileStore", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "studia-filestore-"));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("stores a page under DATA_DIR/uploads/{userId}/{documentId}/{pageIndex}.{ext}", async () => {
    const store = new LocalFileStore(dataDir);

    const storedPath = await store.put("u1", "doc-1", 0, Buffer.from("hello"), "jpg");

    expect(storedPath).toBe(path.join("uploads", "u1", "doc-1", "0.jpg"));
    expect(readFileSync(path.join(dataDir, storedPath), "utf8")).toBe("hello");
  });

  it("reads back exactly what was stored", async () => {
    const store = new LocalFileStore(dataDir);
    const storedPath = await store.put("u1", "doc-1", 0, Buffer.from("hello"), "jpg");

    expect((await store.read(storedPath)).toString()).toBe("hello");
  });

  it("deletes a file and cleans up the now-empty document directory", async () => {
    const store = new LocalFileStore(dataDir);
    const storedPath = await store.put("u1", "doc-1", 0, Buffer.from("hello"), "jpg");
    const documentDir = path.dirname(path.join(dataDir, storedPath));

    await store.delete(storedPath);

    expect(() => readFileSync(path.join(dataDir, storedPath))).toThrow();
    expect(() => readFileSync(documentDir)).toThrow(); // directory gone too
  });

  it("delete is a no-op for a file that does not exist", async () => {
    const store = new LocalFileStore(dataDir);
    await expect(store.delete(path.join("uploads", "u1", "doc-1", "0.jpg"))).resolves.toBeUndefined();
  });
});
