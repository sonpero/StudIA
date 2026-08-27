import { deleteCard, generateForNotion, getGenerationStatus, listCards, type CardRepository } from "@studia/core";
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

  app.post("/api/documents/:id/generate", async (request, reply) => {
    const { id } = request.params as { id: string };
    const notions = await opts.notionRepo.listNotions(request.user!.id, id);
    if (notions.length === 0) return reply.code(403).send({ error: "not-found" });

    const now = opts.clock.now();
    const jobIds = await Promise.all(
      notions.map((notion) =>
        generateForNotion({ jobQueue: opts.jobQueue }, request.user!.id, notion.id, ["flashcard"], now, id),
      ),
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
