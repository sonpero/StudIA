import {
  deleteNotion,
  listNotions,
  listNotionStatuses,
  reorderNotions,
  retryNotionSplit,
  searchNotions,
  updateNotion,
  type Clock,
  type DocumentRepository,
  type JobQueue,
  type NotionRepository,
} from "@studia/core";
import type { FastifyPluginCallback } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

export interface NotionsRoutesOptions {
  repo: NotionRepository;
  markNotionStale: (userId: string, notionId: string) => Promise<void>;
  documentRepo: DocumentRepository;
  jobQueue: JobQueue;
  clock: Clock;
}

const updateNotionBodySchema = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
});

const reorderBodySchema = z.object({ orderedIds: z.array(z.string()) });

// Local to apps/api, not packages/contracts (frozen). As a response schema
// it also strips anything beyond these two fields on serialization — the
// split job's lastError is developer-facing and must never reach the client.
const notionStatusesResponseSchema = z.array(z.object({ documentId: z.string(), status: z.enum(["pending", "ready", "failed"]) }));

export const notionsRoutes: FastifyPluginCallback<NotionsRoutesOptions> = (app, opts, done) => {
  const deps = { repo: opts.repo };

  app.get("/api/documents/:id/notions", async (request) => {
    const { id } = request.params as { id: string };
    return listNotions(deps, request.user!.id, id);
  });

  app.withTypeProvider<ZodTypeProvider>().get(
    "/api/notions/statuses",
    { schema: { response: { 200: notionStatusesResponseSchema } } },
    async (request) => listNotionStatuses({ jobQueue: opts.jobQueue }, request.user!.id),
  );

  // 403 for another user's or an unknown document, 409 when the notion step
  // has not failed — the same mapping as ingestion's own POST
  // /api/documents/:id/retry — or when the document already has notions.
  app.post("/api/documents/:id/notions/retry", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await retryNotionSplit({ documentRepo: opts.documentRepo, jobQueue: opts.jobQueue, notionRepo: opts.repo }, request.user!.id, id, opts.clock.now());
    if (!result.ok) {
      return reply.code(result.error === "not-found" ? 403 : 409).send({ error: result.error });
    }
    return reply.code(202).send({ jobId: result.value.jobId });
  });

  app.get("/api/search", async (request) => {
    const { q } = request.query as { q?: string };
    return searchNotions(deps, request.user!.id, q ?? "");
  });

  app.withTypeProvider<ZodTypeProvider>().patch(
    "/api/notions/:id",
    { schema: { body: updateNotionBodySchema } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await updateNotion({ repo: opts.repo, markNotionStale: opts.markNotionStale }, request.user!.id, id, request.body);
      if (!result.ok) {
        return reply.code(result.error === "not-found" ? 403 : 400).send({ error: result.error });
      }
      return result.value;
    },
  );

  app.withTypeProvider<ZodTypeProvider>().post(
    "/api/documents/:id/notions/reorder",
    { schema: { body: reorderBodySchema } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await reorderNotions(deps, request.user!.id, id, request.body.orderedIds);
      if (!result.ok) return reply.code(400).send({ error: result.error });
      return reply.code(204).send();
    },
  );

  app.delete("/api/notions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await deleteNotion(deps, request.user!.id, id);
    if (!result.ok) return reply.code(403).send({ error: "not-found" });
    return reply.code(204).send();
  });

  done();
};
