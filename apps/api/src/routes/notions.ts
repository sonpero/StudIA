import { deleteNotion, listNotions, reorderNotions, searchNotions, updateNotion, type NotionRepository } from "@studia/core";
import type { FastifyPluginCallback } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

export interface NotionsRoutesOptions {
  repo: NotionRepository;
  markNotionStale: (userId: string, notionId: string) => Promise<void>;
}

const updateNotionBodySchema = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
});

const reorderBodySchema = z.object({ orderedIds: z.array(z.string()) });

export const notionsRoutes: FastifyPluginCallback<NotionsRoutesOptions> = (app, opts, done) => {
  const deps = { repo: opts.repo };

  app.get("/api/documents/:id/notions", async (request) => {
    const { id } = request.params as { id: string };
    return listNotions(deps, request.user!.id, id);
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
