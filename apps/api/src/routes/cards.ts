import { deleteCard, getGenerationStatus, listCards, requestCourseCards, type CardRepository } from "@studia/core";
import type { JobQueue, KeyNotionRepository, NotionRepository } from "@studia/core";
import type { FastifyPluginCallback } from "fastify";

export interface CardsRoutesOptions {
  cardRepo: CardRepository;
  keyNotionRepo: KeyNotionRepository;
  notionRepo: NotionRepository;
  jobQueue: JobQueue;
  clock: { now: () => Date };
}

export const cardsRoutes: FastifyPluginCallback<CardsRoutesOptions> = (app, opts, done) => {
  app.get("/api/notions/:id/cards", async (request) => {
    const { id } = request.params as { id: string };
    return listCards({ repo: opts.cardRepo }, request.user!.id, id);
  });

  // M11's single trigger (docs/reports/notions-cles-conception.md): one job
  // for the whole course, every card type. It replaced the per-notion,
  // per-type routes (decision D7).
  app.post("/api/documents/:id/cards/generate", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await requestCourseCards(
      { jobQueue: opts.jobQueue, keyNotionRepo: opts.keyNotionRepo, notionRepo: opts.notionRepo },
      request.user!.id,
      id,
      opts.clock.now(),
    );
    if (result.ok) return reply.code(202).send(result.value);
    if (result.error === "not-found") return reply.code(403).send({ error: "not-found" });
    return reply.code(409).send({ error: result.error });
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
