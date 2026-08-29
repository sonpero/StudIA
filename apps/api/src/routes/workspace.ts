import { createTodo, deleteTodo, updateTodo, type Clock, type DocumentRepository, type IdGenerator, type TodoRepository } from "@studia/core";
import type { FastifyPluginCallback } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

export interface WorkspaceRoutesOptions {
  repo: TodoRepository;
  documentRepo: DocumentRepository;
  idGenerator: IdGenerator;
  clock: Clock;
}

const createTodoBodySchema = z.object({
  label: z.string().min(1),
  dueDate: z.string().nullable().optional(),
  documentId: z.string().nullable().optional(),
});

const updateTodoBodySchema = z
  .object({
    label: z.string().min(1).optional(),
    dueDate: z.string().nullable().optional(),
    documentId: z.string().nullable().optional(),
    done: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "at least one field is required" });

export const workspaceRoutes: FastifyPluginCallback<WorkspaceRoutesOptions> = (app, opts, done) => {
  const deps = { repo: opts.repo, idGenerator: opts.idGenerator };

  // documentId is a secondary, optional field on the todo body, not the
  // URL's primary resource — a bad link is reported as a 400 validation
  // error on the input, not the 403 "not-found" convention this codebase
  // reserves for "the resource named in the URL path isn't yours"
  // (apps/api/src/routes/{documents,progress,notions}.ts).
  async function documentIdIsValid(userId: string, documentId: string | null | undefined): Promise<boolean> {
    if (documentId === null || documentId === undefined) return true;
    return (await opts.documentRepo.findDocument(userId, documentId)) !== null;
  }

  app.withTypeProvider<ZodTypeProvider>().post(
    "/api/todos",
    { schema: { body: createTodoBodySchema } },
    async (request, reply) => {
      const userId = request.user!.id;
      if (!(await documentIdIsValid(userId, request.body.documentId))) return reply.code(400).send({ error: "invalid-document" });

      const todo = await createTodo(deps, userId, request.body, opts.clock.now());
      return reply.code(201).send(todo);
    },
  );

  app.withTypeProvider<ZodTypeProvider>().patch(
    "/api/todos/:id",
    { schema: { body: updateTodoBodySchema } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const userId = request.user!.id;
      if (!(await documentIdIsValid(userId, request.body.documentId))) return reply.code(400).send({ error: "invalid-document" });

      const result = await updateTodo(deps, userId, id, request.body);
      if (!result.ok) return reply.code(403).send({ error: "not-found" });
      return result.value;
    },
  );

  app.delete("/api/todos/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await deleteTodo(deps, request.user!.id, id);
    if (!result.ok) return reply.code(403).send({ error: "not-found" });
    return reply.code(204).send();
  });

  done();
};
