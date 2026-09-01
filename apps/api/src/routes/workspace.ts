import {
  confirmProposals,
  createTodo,
  deleteTodo,
  endPomodoro,
  getActivePomodoro,
  getCalendar,
  getProposals,
  getToday,
  rejectProposals,
  startPomodoro,
  startTodoPhotoExtraction,
  updateTodo,
  type Clock,
  type DocumentRepository,
  type FileStore,
  type IdGenerator,
  type JobQueue,
  type NotionRepository,
  type ProgressRepository,
  type ReviewRepository,
  type TodoExtractor,
  type TodoRepository,
} from "@studia/core";
import type { FastifyPluginCallback } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export interface WorkspaceRoutesOptions {
  repo: TodoRepository;
  documentRepo: DocumentRepository;
  notionRepo: NotionRepository;
  reviewRepo: ReviewRepository;
  progressRepo: ProgressRepository;
  fileStore: FileStore;
  jobQueue: JobQueue;
  extractor: TodoExtractor;
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

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const startPomodoroBodySchema = z.object({ todoId: z.string().optional() });

export const workspaceRoutes: FastifyPluginCallback<WorkspaceRoutesOptions> = (app, opts, done) => {
  const deps = { repo: opts.repo, idGenerator: opts.idGenerator };
  const getTodayDeps = { todoRepo: opts.repo, documentRepo: opts.documentRepo, notionRepo: opts.notionRepo, reviewRepo: opts.reviewRepo, progressRepo: opts.progressRepo };

  // Same rule and same helper shape as progress's own today (client-computed
  // local calendar day, never guessed server-side) and review's own
  // dayBoundary (client-computed local "start of tomorrow") — two different
  // clocks for two different reasons (getToday's own doc comment), each
  // validated the same way its own module's existing routes already do.
  app.get("/api/today", async (request, reply) => {
    const { today, dayBoundary } = request.query as { today?: string; dayBoundary?: string };
    if (!today || !DATE_KEY_PATTERN.test(today)) return reply.code(400).send({ error: "today-required" });
    if (!dayBoundary || Number.isNaN(new Date(dayBoundary).getTime())) return reply.code(400).send({ error: "day-boundary-required" });

    return getToday(getTodayDeps, request.user!.id, new Date(`${today}T00:00:00.000Z`), new Date(dayBoundary));
  });

  // Client-computed month bounds, same rule as today/dayBoundary above —
  // the server never guesses which month is displayed. Both inclusive
  // (docs/modules/workspace.md's Calendar section).
  const getCalendarDeps = { todoRepo: opts.repo, documentRepo: opts.documentRepo, progressRepo: opts.progressRepo };
  app.get("/api/calendar", async (request, reply) => {
    const { start, end } = request.query as { start?: string; end?: string };
    if (!start || !DATE_KEY_PATTERN.test(start)) return reply.code(400).send({ error: "start-required" });
    if (!end || !DATE_KEY_PATTERN.test(end)) return reply.code(400).send({ error: "end-required" });

    return getCalendar(getCalendarDeps, request.user!.id, start, end);
  });

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

  const startExtractionDeps = { fileStore: opts.fileStore, jobQueue: opts.jobQueue, idGenerator: opts.idGenerator };
  const proposalDeps = { repo: opts.repo, jobQueue: opts.jobQueue };
  const confirmDeps = { repo: opts.repo, jobQueue: opts.jobQueue, fileStore: opts.fileStore, idGenerator: opts.idGenerator };
  const rejectDeps = { repo: opts.repo, jobQueue: opts.jobQueue, fileStore: opts.fileStore };

  app.post("/api/todos/from-photo", async (request, reply) => {
    const file = await request.file({ limits: { fileSize: MAX_UPLOAD_BYTES + 1 } });
    if (!file) return reply.code(400).send({ error: "missing_file" });

    const bytes = await file.toBuffer();
    const { jobId } = await startTodoPhotoExtraction(startExtractionDeps, request.user!.id, bytes, file.mimetype, opts.clock.now());
    return reply.code(202).send({ jobId });
  });

  app.get("/api/todos/proposals/:jobId", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const result = await getProposals(proposalDeps, request.user!.id, jobId);
    if (!result.ok) return reply.code(403).send({ error: "not-found" });
    return result.value;
  });

  app.withTypeProvider<ZodTypeProvider>().post(
    "/api/todos/proposals/:jobId/confirm",
    { schema: { body: z.object({ accepted: z.array(z.string()) }) } },
    async (request, reply) => {
      const { jobId } = request.params as { jobId: string };
      const result = await confirmProposals(confirmDeps, request.user!.id, jobId, request.body.accepted, opts.clock.now());
      if (!result.ok) return reply.code(403).send({ error: "not-found" });
      return result.value;
    },
  );

  app.post("/api/todos/proposals/:jobId/reject", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const result = await rejectProposals(rejectDeps, request.user!.id, jobId);
    if (!result.ok) return reply.code(403).send({ error: "not-found" });
    return reply.code(204).send();
  });

  // Pomodoro (M7, docs/modules/workspace.md's "Pomodoro (M7)" note).
  app.withTypeProvider<ZodTypeProvider>().post(
    "/api/pomodoro",
    { schema: { body: startPomodoroBodySchema } },
    async (request, reply) => {
      const result = await startPomodoro(deps, request.user!.id, opts.clock.now(), request.body.todoId ?? null);
      if (!result.ok) {
        if (result.error.kind === "todo-not-found") return reply.code(400).send({ error: "todo-not-found" });
        return reply.code(409).send(result.error.session);
      }
      return reply.code(201).send(result.value);
    },
  );

  app.post("/api/pomodoro/:id/end", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await endPomodoro(deps, request.user!.id, id, opts.clock.now());
    if (!result.ok) return reply.code(403).send({ error: "not-found" });
    return reply.code(204).send();
  });

  app.get("/api/pomodoro/active", async (request, reply) => {
    const active = await getActivePomodoro(deps, request.user!.id, opts.clock.now());
    if (!active) return reply.code(404).send();
    return active;
  });

  done();
};
