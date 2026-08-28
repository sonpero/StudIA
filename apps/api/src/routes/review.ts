import { abandonSession, getDueCards, getNotionsProgress, getProgress, startSession, submitReview, type ReviewRepository } from "@studia/core";
import type { FastifyPluginCallback } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

export interface ReviewRoutesOptions {
  repo: ReviewRepository;
  idGenerator: { next: () => string };
  clock: { now: () => Date };
}

const startSessionBodySchema = z.object({
  documentId: z.string().optional(),
  notionId: z.string().optional(),
  limit: z.number().int().positive().optional(),
  // The client's local "start of tomorrow" (product decision: dueness is a
  // calendar-day threshold, decided by the user's own clock — never a
  // fixed server timezone).
  dayBoundary: z.string().datetime(),
});
const submitReviewBodySchema = z.object({ rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]), elapsedMs: z.number().int().nonnegative() });

export const reviewRoutes: FastifyPluginCallback<ReviewRoutesOptions> = (app, opts, done) => {
  app.get("/api/review/due", async (request, reply) => {
    const { documentId, notionId, limit, dayBoundary } = request.query as { documentId?: string; notionId?: string; limit?: string; dayBoundary?: string };
    if (!dayBoundary || Number.isNaN(new Date(dayBoundary).getTime())) return reply.code(400).send({ error: "day-boundary-required" });
    return getDueCards(
      { repo: opts.repo },
      request.user!.id,
      new Date(dayBoundary),
      { documentId, notionId, limit: limit ? Number(limit) : undefined },
    );
  });

  app.withTypeProvider<ZodTypeProvider>().post(
    "/api/review/sessions",
    { schema: { body: startSessionBodySchema } },
    async (request) => {
      const result = await startSession(
        { repo: opts.repo, idGenerator: opts.idGenerator },
        request.user!.id,
        opts.clock.now(),
        new Date(request.body.dayBoundary),
        {
          documentId: request.body.documentId,
          notionId: request.body.notionId,
          limit: request.body.limit,
        },
      );
      return { sessionId: result.sessionId, cards: result.cards };
    },
  );

  app.withTypeProvider<ZodTypeProvider>().post(
    "/api/review/cards/:id",
    { schema: { body: submitReviewBodySchema } },
    async (request) => {
      const { id } = request.params as { id: string };
      return submitReview({ repo: opts.repo, idGenerator: opts.idGenerator }, request.user!.id, id, request.body.rating, request.body.elapsedMs, opts.clock.now());
    },
  );

  app.post("/api/review/sessions/:id/abandon", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await abandonSession({ repo: opts.repo }, request.user!.id, id, opts.clock.now());
    if (!result.ok) return reply.code(403).send({ error: "not-found" });
    return reply.code(204).send();
  });

  app.get("/api/documents/:id/progress", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { dayBoundary } = request.query as { dayBoundary?: string };
    if (!dayBoundary || Number.isNaN(new Date(dayBoundary).getTime())) return reply.code(400).send({ error: "day-boundary-required" });
    return getProgress({ repo: opts.repo }, request.user!.id, id, new Date(dayBoundary));
  });

  app.get("/api/documents/:id/notions-progress", async (request) => {
    const { id } = request.params as { id: string };
    return getNotionsProgress({ repo: opts.repo }, request.user!.id, id);
  });

  done();
};
