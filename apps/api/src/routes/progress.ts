import {
  deleteDeadline,
  getCourseProgress,
  getDeadline,
  listProgress,
  setDeadline,
  type Clock,
  type Document,
  type DocumentRepository,
  type IdGenerator,
  type NotionRepository,
  type ProgressRepository,
  type ReviewRepository,
} from "@studia/core";
import type { FastifyPluginCallback } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

export interface ProgressRoutesOptions {
  repo: ProgressRepository;
  documentRepo: DocumentRepository;
  notionRepo: NotionRepository;
  reviewRepo: ReviewRepository;
  idGenerator: IdGenerator;
  clock: Clock;
}

const setDeadlineBodySchema = z.object({ date: z.string(), label: z.string().optional() });

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const progressRoutes: FastifyPluginCallback<ProgressRoutesOptions> = (app, opts, done) => {
  const progressDeps = { repo: opts.repo, notionRepo: opts.notionRepo, reviewRepo: opts.reviewRepo };

  async function findOwnedDocument(userId: string, documentId: string): Promise<Document | null> {
    return opts.documentRepo.findDocument(userId, documentId);
  }

  // "What day is today" is the user's own local calendar day, decided
  // client-side, never guessed from the server's timezone (same product
  // decision as review's dayBoundary). today is a plain "YYYY-MM-DD";
  // anchoring it at UTC midnight makes computeProgress's own UTC-based
  // date-key derivation read back exactly that same string, regardless of
  // the server's timezone.
  function parseToday(raw: unknown): Date | null {
    if (typeof raw !== "string" || !DATE_KEY_PATTERN.test(raw)) return null;
    const date = new Date(`${raw}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  app.withTypeProvider<ZodTypeProvider>().post(
    "/api/documents/:id/deadline",
    { schema: { body: setDeadlineBodySchema } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!(await findOwnedDocument(request.user!.id, id))) return reply.code(403).send({ error: "not-found" });
      await setDeadline({ repo: opts.repo, idGenerator: opts.idGenerator }, request.user!.id, id, request.body.date, opts.clock.now(), request.body.label);
      return reply.code(204).send();
    },
  );

  app.delete("/api/documents/:id/deadline", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!(await findOwnedDocument(request.user!.id, id))) return reply.code(403).send({ error: "not-found" });
    await deleteDeadline({ repo: opts.repo }, request.user!.id, id);
    return reply.code(204).send();
  });

  // New: fills the M5-as-shipped debt (the deadline form was write-only).
  // 404 { error: "no-deadline" } — a distinct body from the 403
  // { error: "not-found" } ownership check above. Both used to read
  // "not-found" in this file for two different meanings (wrong owner vs.
  // no deadline set); they no longer share a body, even though the status
  // code alone already disambiguated them.
  app.get("/api/documents/:id/deadline", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!(await findOwnedDocument(request.user!.id, id))) return reply.code(403).send({ error: "not-found" });
    const deadline = await getDeadline({ repo: opts.repo }, request.user!.id, id);
    if (!deadline) return reply.code(404).send({ error: "no-deadline" });
    return reply.send({ date: deadline.date, label: deadline.label });
  });

  // New: one course's progress. Named "course-progress", not "progress" —
  // `review` already owns GET /api/documents/:id/progress (returns
  // {mastered, total}, docs/modules/review.md), a genuine path collision
  // discovered at boot time (Fastify: FST_ERR_DUPLICATED_ROUTE) while
  // wiring this route in, not a style choice. Always 200: getCourseProgress
  // can't fail (docs/modules/progress.md), so a lapsed deadline is a
  // normal read whose progress.status is 'deadline-in-past', not a 422 —
  // revised from the original design, which mapped it to 422. Carries
  // title/deadlineDate/deadlineLabel alongside progress so the mandatory
  // status phrase renders without a second call.
  app.get("/api/documents/:id/course-progress", async (request, reply) => {
    const { id } = request.params as { id: string };
    const today = parseToday((request.query as { today?: unknown }).today);
    if (!today) return reply.code(400).send({ error: "today-required" });
    const document = await findOwnedDocument(request.user!.id, id);
    if (!document) return reply.code(403).send({ error: "not-found" });

    const result = await getCourseProgress(progressDeps, request.user!.id, id, today);
    return reply.send({ title: document.title, deadlineDate: result.deadlineDate, deadlineLabel: result.deadlineLabel, progress: result.progress });
  });

  // New: every course's progress, one aggregate call — never one request
  // per course (docs/modules/progress.md's N+1 discipline). Always 200: a
  // document past its deadline is carried in-band via its own
  // progress.status ('deadline-in-past'), never dropped from the array.
  // Named "course-progress" for symmetry with the single-document route
  // above, even though a bare /api/progress would not itself have
  // collided.
  app.get("/api/course-progress", async (request, reply) => {
    const today = parseToday((request.query as { today?: unknown }).today);
    if (!today) return reply.code(400).send({ error: "today-required" });
    return reply.send(await listProgress({ repo: opts.repo, documentRepo: opts.documentRepo, notionRepo: opts.notionRepo, reviewRepo: opts.reviewRepo }, request.user!.id, today));
  });

  done();
};
