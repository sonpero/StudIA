import {
  addPage,
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  readPageFile,
  retryExtraction,
  startExtraction,
  type DocumentRepository,
  type FileStore,
  type JobQueue,
  type IdGenerator,
  type Clock,
} from "@studia/core";
import { createDocumentRequestSchema, documentDetailSchema, documentSummarySchema } from "@studia/contracts";
import type { FastifyPluginCallback } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

export interface DocumentsRoutesOptions {
  repo: DocumentRepository;
  fileStore: FileStore;
  jobQueue: JobQueue;
  idGenerator: IdGenerator;
  clock: Clock;
}

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

// Derived from our own stored file extension, never from the client's
// claimed upload Content-Type (ingestion.md: "never echo the uploaded MIME
// type back") — Page doesn't persist the original mimetype, only the path.
const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function contentTypeForStoredPath(storedPath: string): string {
  const ext = storedPath.split(".").pop() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

export const documentsRoutes: FastifyPluginCallback<DocumentsRoutesOptions> = (app, opts, done) => {
  const deps = { repo: opts.repo, fileStore: opts.fileStore, jobQueue: opts.jobQueue };

  app.withTypeProvider<ZodTypeProvider>().post(
    "/api/documents",
    { schema: { body: createDocumentRequestSchema, response: { 201: documentSummarySchema } } },
    async (request, reply) => {
      const doc = await createDocument(
        { repo: opts.repo, idGenerator: opts.idGenerator },
        request.user!.id,
        request.body.title,
        request.body.sourceType,
        opts.clock.now(),
      );
      return reply.code(201).send(doc);
    },
  );

  app.post("/api/documents/:id/pages", async (request, reply) => {
    const { id } = request.params as { id: string };
    const file = await request.file({ limits: { fileSize: MAX_UPLOAD_BYTES + 1 } });
    if (!file) return reply.code(400).send({ error: "missing_file" });

    const bytes = await file.toBuffer();
    const result = await addPage({ repo: opts.repo, fileStore: opts.fileStore }, request.user!.id, id, bytes, file.mimetype, file.filename, opts.clock.now());

    if (!result.ok) {
      if (result.error === "not-found") return reply.code(403).send({ error: "not-found" });
      if (result.error === "duplicate") return reply.code(409).send({ error: "duplicate" });
      if (result.error === "too-large") return reply.code(413).send({ error: "too-large" });
      return reply.code(400).send({ error: "unsupported" });
    }
    return reply.code(201).send({ documentId: result.value.documentId, index: result.value.index, sha256: result.value.sha256, sizeBytes: result.value.sizeBytes });
  });

  app.post("/api/documents/:id/extract", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await startExtraction(deps, request.user!.id, id, opts.clock.now());
    if (!result.ok) return reply.code(403).send({ error: "not-found" });
    return reply.code(202).send({ jobId: result.value.jobId });
  });

  app.withTypeProvider<ZodTypeProvider>().get(
    "/api/documents",
    { schema: { response: { 200: z.array(documentSummarySchema) } } },
    async (request) => listDocuments(deps, request.user!.id),
  );

  app.withTypeProvider<ZodTypeProvider>().get(
    "/api/documents/:id",
    { schema: { response: { 200: documentDetailSchema, 403: z.object({ error: z.string() }) } } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await getDocument(deps, request.user!.id, id);
      if (!result.ok) return reply.code(403).send({ error: "not-found" });
      return result.value;
    },
  );

  app.get("/api/documents/:id/pages/:index/file", async (request, reply) => {
    const { id, index } = request.params as { id: string; index: string };
    const pageIndex = Number(index);
    const result = await readPageFile({ repo: opts.repo, fileStore: opts.fileStore }, request.user!.id, id, pageIndex);
    if (!result.ok) return reply.code(403).send({ error: "not-found" });

    return reply
      .header("Content-Disposition", "inline")
      .type(contentTypeForStoredPath(result.value.page.storedPath))
      .send(result.value.bytes);
  });

  app.post("/api/documents/:id/retry", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await retryExtraction(deps, request.user!.id, id, opts.clock.now());
    if (!result.ok) {
      return reply.code(result.error === "not-found" ? 403 : 409).send({ error: result.error });
    }
    return reply.code(202).send({ jobId: result.value.jobId });
  });

  app.delete("/api/documents/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await deleteDocument({ repo: opts.repo, fileStore: opts.fileStore }, request.user!.id, id);
    if (!result.ok) return reply.code(403).send({ error: "not-found" });
    return reply.code(204).send();
  });

  done();
};
