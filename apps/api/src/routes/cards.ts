import { deleteCard, generateForNotion, getGenerationStatus, listCards, type CardRepository, type CardType } from "@studia/core";
import type { JobQueue, NotionRepository } from "@studia/core";
import type { FastifyPluginCallback } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

export interface CardsRoutesOptions {
  cardRepo: CardRepository;
  notionRepo: NotionRepository;
  jobQueue: JobQueue;
  clock: { now: () => Date };
}

const generateBodySchema = z.object({ types: z.array(z.enum(["flashcard", "mcq", "open"])) });

export const cardsRoutes: FastifyPluginCallback<CardsRoutesOptions> = (app, opts, done) => {
  app.get("/api/notions/:id/cards", async (request) => {
    const { id } = request.params as { id: string };
    return listCards({ repo: opts.cardRepo }, request.user!.id, id);
  });

  app.withTypeProvider<ZodTypeProvider>().post(
    "/api/notions/:id/generate",
    { schema: { body: generateBodySchema } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const notion = await opts.notionRepo.findNotion(request.user!.id, id);
      if (!notion) return reply.code(403).send({ error: "not-found" });

      const result = await generateForNotion(
        { jobQueue: opts.jobQueue },
        request.user!.id,
        id,
        request.body.types,
        opts.clock.now(),
        notion.documentId,
      );
      return reply.code(202).send(result);
    },
  );

  // Body is optional and hand-cast, not a zod-validated schema (unlike the
  // route above): an absent/empty body is a legitimate call meaning "keep
  // M3's flashcard-only default" (docs/modules/generation.md's open
  // question — "user choice in M4"), and fastify-type-provider-zod treats
  // a wholly-missing body as invalid even when every field is .optional().
  app.post("/api/documents/:id/generate", async (request, reply) => {
    const { id } = request.params as { id: string };
    const notions = await opts.notionRepo.listNotions(request.user!.id, id);
    if (notions.length === 0) return reply.code(403).send({ error: "not-found" });

    const { types } = (request.body ?? {}) as { types?: CardType[] };
    const requestedTypes = types && types.length > 0 ? types : (["flashcard"] as CardType[]);
    const now = opts.clock.now();
    const jobIds = await Promise.all(
      notions.map((notion) => generateForNotion({ jobQueue: opts.jobQueue }, request.user!.id, notion.id, requestedTypes, now, id)),
    );
    return reply.code(202).send({ jobIds: jobIds.map((j) => j.jobId) });
  });

  app.get("/api/documents/:id/generation-status", async (request) => {
    const { id } = request.params as { id: string };
    return getGenerationStatus({ jobQueue: opts.jobQueue }, request.user!.id, id);
  });

  app.delete("/api/cards/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await deleteCard({ repo: opts.cardRepo }, request.user!.id, id);
    if (!result.ok) return reply.code(403).send({ error: "not-found" });
    return reply.code(204).send();
  });

  done();
};
