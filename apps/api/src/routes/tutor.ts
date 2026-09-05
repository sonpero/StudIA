import {
  ask,
  createConversation,
  deleteConversation,
  getConversation,
  type AskDeps,
  type ChatModel,
  type CitationExtractor,
  type Clock,
  type ConversationRepository,
  type DocumentRepository,
  type IdGenerator,
  type JobQueue,
} from "@studia/core";
import type { FastifyPluginCallback } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

export interface TutorRoutesOptions {
  conversationRepo: ConversationRepository;
  documentRepo: DocumentRepository;
  jobQueue: JobQueue;
  chatModel: ChatModel;
  citationExtractor: CitationExtractor;
  idGenerator: IdGenerator;
  clock: Clock;
}

const citationSchema = z.object({ text: z.string() });

const conversationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  documentId: z.string(),
  title: z.string().nullable(),
  createdAt: z.string(),
});

const messageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  citations: z.array(citationSchema).nullable(),
  partial: z.boolean(),
  createdAt: z.string(),
});

const conversationDetailSchema = z.object({ conversation: conversationSchema, messages: z.array(messageSchema) });
const errorSchema = z.object({ error: z.string() });
const askBodySchema = z.object({ question: z.string().min(1) });

// Two distinct SSE event names for the terminal event, `done` and `partial`,
// never one event with a field next to the text (docs/modules/tutor.md's
// Answer union and API section): a client that only listens for `done` sees
// nothing at all for a truncated answer -- a visible gap, never a false
// success. Token chunks stream as `event: chunk` in between.
export const tutorRoutes: FastifyPluginCallback<TutorRoutesOptions> = (app, opts, done) => {
  const askDeps: AskDeps = {
    documentRepo: opts.documentRepo,
    jobQueue: opts.jobQueue,
    conversationRepo: opts.conversationRepo,
    chatModel: opts.chatModel,
    citationExtractor: opts.citationExtractor,
    idGenerator: opts.idGenerator,
  };

  app.withTypeProvider<ZodTypeProvider>().post(
    "/api/documents/:id/conversations",
    { schema: { response: { 201: conversationSchema, 403: errorSchema } } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await createConversation(
        { documentRepo: opts.documentRepo, conversationRepo: opts.conversationRepo, idGenerator: opts.idGenerator },
        request.user!.id,
        id,
        opts.clock.now(),
      );
      if (!result.ok) return reply.code(403).send({ error: "not-found" });
      return reply.code(201).send(result.value);
    },
  );

  app.withTypeProvider<ZodTypeProvider>().get(
    "/api/conversations/:id",
    { schema: { response: { 200: conversationDetailSchema, 403: errorSchema } } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const detail = await getConversation({ conversationRepo: opts.conversationRepo }, request.user!.id, id);
      if (!detail) return reply.code(403).send({ error: "not-found" });
      return detail;
    },
  );

  app.delete("/api/conversations/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await deleteConversation({ conversationRepo: opts.conversationRepo }, request.user!.id, id);
    if (!result.ok) return reply.code(403).send({ error: "not-found" });
    return reply.code(204).send();
  });

  app.withTypeProvider<ZodTypeProvider>().post(
    "/api/conversations/:id/messages",
    { schema: { body: askBodySchema } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await ask(askDeps, request.user!.id, request.body.question, id, opts.clock.now());
      if (!result.ok) {
        const status = result.error === "document-not-ready" ? 409 : 403;
        return reply.code(status).send({ error: result.error });
      }

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      try {
        const session = result.value;
        let step = await session.next();
        while (!step.done) {
          reply.raw.write(`event: chunk\ndata: ${JSON.stringify({ text: step.value })}\n\n`);
          step = await session.next();
        }

        const answer = step.value;
        if (answer.kind === "complete") {
          reply.raw.write(`event: done\ndata: ${JSON.stringify({ citations: answer.citations, grounded: answer.grounded })}\n\n`);
        } else {
          reply.raw.write("event: partial\ndata: {}\n\n");
        }
      } catch {
        // Never leave the connection hanging with no terminal event
        // (docs/modules/tutor.md): an unexpected failure here is not one of
        // the model failure modes ask() already turns into a 'partial'
        // Answer (it catches those itself), so there is no real answer text
        // to report -- the client sees the same signal it would for a
        // stream cut short, which is the closest existing state to "this
        // did not finish".
        reply.raw.write("event: partial\ndata: {}\n\n");
      }
      reply.raw.end();
      return reply;
    },
  );

  done();
};
