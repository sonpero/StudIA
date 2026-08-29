import { deleteDeadline, setDeadline, type Clock, type DocumentRepository, type IdGenerator, type ProgressRepository } from "@studia/core";
import type { FastifyPluginCallback } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

export interface ProgressRoutesOptions {
  repo: ProgressRepository;
  documentRepo: DocumentRepository;
  idGenerator: IdGenerator;
  clock: Clock;
}

const setDeadlineBodySchema = z.object({ date: z.string(), label: z.string().optional() });

export const progressRoutes: FastifyPluginCallback<ProgressRoutesOptions> = (app, opts, done) => {
  async function assertOwnsDocument(userId: string, documentId: string): Promise<boolean> {
    return (await opts.documentRepo.findDocument(userId, documentId)) !== null;
  }

  app.withTypeProvider<ZodTypeProvider>().post(
    "/api/documents/:id/deadline",
    { schema: { body: setDeadlineBodySchema } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!(await assertOwnsDocument(request.user!.id, id))) return reply.code(403).send({ error: "not-found" });
      await setDeadline({ repo: opts.repo, idGenerator: opts.idGenerator }, request.user!.id, id, request.body.date, opts.clock.now(), request.body.label);
      return reply.code(204).send();
    },
  );

  app.delete("/api/documents/:id/deadline", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!(await assertOwnsDocument(request.user!.id, id))) return reply.code(403).send({ error: "not-found" });
    await deleteDeadline({ repo: opts.repo }, request.user!.id, id);
    return reply.code(204).send();
  });

  done();
};
