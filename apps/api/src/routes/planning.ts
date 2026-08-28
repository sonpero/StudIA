import {
  deleteDeadline,
  getPlan,
  getToday,
  markDayCompleted,
  setAvailability,
  setDeadline,
  type Clock,
  type DocumentRepository,
  type IdGenerator,
  type NotionRepository,
  type PlanningRepository,
  type ReviewRepository,
} from "@studia/core";
import type { FastifyPluginCallback } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

export interface PlanningRoutesOptions {
  repo: PlanningRepository;
  documentRepo: DocumentRepository;
  notionRepo: NotionRepository;
  reviewRepo: ReviewRepository;
  idGenerator: IdGenerator;
  clock: Clock;
}

const setDeadlineBodySchema = z.object({ date: z.string(), label: z.string().optional() });

const availabilityBodySchema = z.object({
  mon: z.number().int().nonnegative(),
  tue: z.number().int().nonnegative(),
  wed: z.number().int().nonnegative(),
  thu: z.number().int().nonnegative(),
  fri: z.number().int().nonnegative(),
  sat: z.number().int().nonnegative(),
  sun: z.number().int().nonnegative(),
});

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const planningRoutes: FastifyPluginCallback<PlanningRoutesOptions> = (app, opts, done) => {
  const planDeps = { repo: opts.repo, notionRepo: opts.notionRepo, reviewRepo: opts.reviewRepo };

  async function assertOwnsDocument(userId: string, documentId: string): Promise<boolean> {
    return (await opts.documentRepo.findDocument(userId, documentId)) !== null;
  }

  // "What day is today" for the planner's window is the user's own local
  // calendar day, decided client-side, never guessed from the server's
  // timezone (same product decision as review's dayBoundary). today is a
  // plain "YYYY-MM-DD"; anchoring it at UTC midnight makes buildPlan's own
  // UTC-based date-key derivation (domain/build-plan.ts's toDateKey) read
  // back exactly that same string, regardless of the server's timezone.
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

  app.withTypeProvider<ZodTypeProvider>().put(
    "/api/availability",
    { schema: { body: availabilityBodySchema } },
    async (request, reply) => {
      await setAvailability({ repo: opts.repo }, request.user!.id, request.body);
      return reply.code(204).send();
    },
  );

  app.get("/api/documents/:id/plan", async (request, reply) => {
    const { id } = request.params as { id: string };
    const today = parseToday((request.query as { today?: unknown }).today);
    if (!today) return reply.code(400).send({ error: "today-required" });
    if (!(await assertOwnsDocument(request.user!.id, id))) return reply.code(403).send({ error: "not-found" });
    const result = await getPlan(planDeps, request.user!.id, id, today);
    // PlanningInputError (malformed request) is 422, distinct from
    // feasible:false (a normal 200 the frontend renders — see
    // docs/modules/planning.md).
    if (!result.ok) return reply.code(422).send({ error: result.error.kind });
    return result.value;
  });

  app.get("/api/plan/today", async (request, reply) => {
    const today = parseToday((request.query as { today?: unknown }).today);
    if (!today) return reply.code(400).send({ error: "today-required" });
    return getToday({ repo: opts.repo, documentRepo: opts.documentRepo, notionRepo: opts.notionRepo, reviewRepo: opts.reviewRepo }, request.user!.id, today);
  });

  app.post("/api/plan/days/:date/complete", async (request, reply) => {
    const { date } = request.params as { date: string };
    await markDayCompleted({ repo: opts.repo }, request.user!.id, date);
    return reply.code(204).send();
  });

  done();
};
