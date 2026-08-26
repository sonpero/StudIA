import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  Argon2PasswordHasher,
  createOrResetAccount,
  FixtureDocumentExtractor,
  handleExtractionJob,
  LocalFileStore,
  OfficeParserExtractor,
  runWorkerTick,
  SqliteDocumentRepository,
  SqliteJobQueue,
  SqliteUserRepository,
  systemClock,
  uuidV7Generator,
  type ExtractDocumentPayload,
  type JobHandler,
} from "@studia/core";
import { z } from "zod";
import FormData from "form-data";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { openDatabase } from "../db/connection.js";
import { runMigrations } from "../db/migrate.js";

function extractCookie(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!raw) throw new Error("expected a Set-Cookie header");
  const match = /^([^=]+)=([^;]+)/.exec(raw);
  if (!match) throw new Error(`could not parse Set-Cookie header: ${raw}`);
  return `${match[1]}=${match[2]}`;
}

// The one integration test proving the REAL worker wiring (apps/worker/src/index.ts's
// extract-document handler, not a generic test handler) actually drains a
// job the API enqueued, and that the result is visible back over the API —
// "worker picks the job up; status transitions are visible over the API"
// (docs/modules/ingestion.md's Key tests).
describe("worker processes a real API-enqueued extraction job", () => {
  let dir: string;
  let dbPath: string;
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "studia-worker-pipeline-"));
    dbPath = path.join(dir, "test.db");

    const seedDb = openDatabase(dbPath);
    runMigrations(seedDb);
    await createOrResetAccount(
      { userRepository: new SqliteUserRepository(seedDb), passwordHasher: new Argon2PasswordHasher(), idGenerator: uuidV7Generator },
      "alex",
      "s3cret-pass",
      new Date(),
    );

    app = buildApp({ databasePath: dbPath, dataDir: dir, sessionSecret: "test-session-secret", cookieSecure: false, llmAdapter: "fixture" });
  });

  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("photo -> done via the fixture extractor", async () => {
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "alex", password: "s3cret-pass" } });
    const cookie = extractCookie(login.headers["set-cookie"]);

    const createRes = await app.inject({ method: "POST", url: "/api/documents", headers: { cookie }, payload: { title: "Cours", sourceType: "photo" } });
    const { id: documentId } = createRes.json<{ id: string }>();

    const form = new FormData();
    form.append("file", Buffer.from("photo-bytes"), { filename: "p.jpg", contentType: "image/jpeg" });
    await app.inject({ method: "POST", url: `/api/documents/${documentId}/pages`, headers: { cookie, ...form.getHeaders() }, payload: form.getBuffer() });

    await app.inject({ method: "POST", url: `/api/documents/${documentId}/extract`, headers: { cookie } });

    // Simulate the real worker: same db file, real handler wiring, one tick.
    const workerDb = openDatabase(dbPath);
    const jobQueue = new SqliteJobQueue(workerDb, uuidV7Generator);
    const repo = new SqliteDocumentRepository(workerDb);
    const fileStore = new LocalFileStore(dir);
    const extractors = [new FixtureDocumentExtractor("valid"), new OfficeParserExtractor()];
    const handler: JobHandler<ExtractDocumentPayload> = {
      type: "extract-document",
      payloadSchema: z.object({ documentId: z.string() }),
      handle: (payload, ctx) => handleExtractionJob({ repo, fileStore, extractors }, payload, ctx),
    };
    const outcome = await runWorkerTick({ jobQueue, handlers: new Map([[handler.type, handler]]) }, systemClock.now());
    expect(outcome).toBe("claimed");

    const detail = await app.inject({ method: "GET", url: `/api/documents/${documentId}`, headers: { cookie } });
    expect(detail.json<{ status: string; lastError: string | null }>()).toMatchObject({ status: "done", lastError: null });
  });

  it("docx -> done via the real OfficeParserExtractor (no LLM involved)", async () => {
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "alex", password: "s3cret-pass" } });
    const cookie = extractCookie(login.headers["set-cookie"]);

    const createRes = await app.inject({ method: "POST", url: "/api/documents", headers: { cookie }, payload: { title: "Cours docx", sourceType: "docx" } });
    const { id: documentId } = createRes.json<{ id: string }>();

    const docxBytes = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../../../../tests/fixtures/ingestion/sample.docx", import.meta.url)),
    );
    const form = new FormData();
    form.append("file", docxBytes, {
      filename: "cours.docx",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    await app.inject({ method: "POST", url: `/api/documents/${documentId}/pages`, headers: { cookie, ...form.getHeaders() }, payload: form.getBuffer() });
    await app.inject({ method: "POST", url: `/api/documents/${documentId}/extract`, headers: { cookie } });

    const workerDb = openDatabase(dbPath);
    const jobQueue = new SqliteJobQueue(workerDb, uuidV7Generator);
    const repo = new SqliteDocumentRepository(workerDb);
    const fileStore = new LocalFileStore(dir);
    const extractors = [new FixtureDocumentExtractor("valid"), new OfficeParserExtractor()];
    const handler: JobHandler<ExtractDocumentPayload> = {
      type: "extract-document",
      payloadSchema: z.object({ documentId: z.string() }),
      handle: (payload, ctx) => handleExtractionJob({ repo, fileStore, extractors }, payload, ctx),
    };
    await runWorkerTick({ jobQueue, handlers: new Map([[handler.type, handler]]) }, systemClock.now());

    const detail = await app.inject({ method: "GET", url: `/api/documents/${documentId}`, headers: { cookie } });
    expect(detail.json<{ status: string }>().status).toBe("done");
  });
});
