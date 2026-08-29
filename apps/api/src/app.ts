import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import staticPlugin from "@fastify/static";
import { markStale, systemClock, SqliteJobQueue, uuidV7Generator } from "@studia/core";
import Fastify from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { buildContentDeps } from "./content-deps.js";
import { openDatabase } from "./db/connection.js";
import { runMigrations } from "./db/migrate.js";
import { buildGenerationDeps } from "./generation-deps.js";
import { buildIdentityDeps } from "./identity-deps.js";
import { buildIngestionDeps } from "./ingestion-deps.js";
import { authPlugin } from "./plugins/auth.js";
import { dbPlugin } from "./plugins/db.js";
import { buildProgressDeps } from "./progress-deps.js";
import { buildReviewDeps } from "./review-deps.js";
import { authRoutes } from "./routes/auth.js";
import { cardsRoutes } from "./routes/cards.js";
import { documentsRoutes } from "./routes/documents.js";
import { healthRoutes } from "./routes/health.js";
import { meRoutes } from "./routes/me.js";
import { notionsRoutes } from "./routes/notions.js";
import { progressRoutes } from "./routes/progress.js";
import { reviewRoutes } from "./routes/review.js";

export interface BuildAppOptions {
  databasePath: string;
  dataDir: string;
  webDistPath?: string;
  sessionSecret: string;
  cookieSecure: boolean;
  llmAdapter: "fixture" | "real";
  anthropicApiKey?: string;
}

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export function buildApp(opts: BuildAppOptions) {
  if (!opts.sessionSecret) {
    throw new Error(
      "SESSION_SECRET must be set (see CLAUDE.md and docs/modules/identity.md). Refusing to start without it.",
    );
  }

  const db = openDatabase(opts.databasePath);
  runMigrations(db);
  const identityDeps = buildIdentityDeps(db, opts.sessionSecret);
  const jobQueue = new SqliteJobQueue(db, uuidV7Generator);
  const ingestionDeps = buildIngestionDeps({
    db,
    dataDir: opts.dataDir,
    llmAdapter: opts.llmAdapter,
    anthropicApiKey: opts.anthropicApiKey,
  });
  const contentDeps = buildContentDeps({ db, llmAdapter: opts.llmAdapter, anthropicApiKey: opts.anthropicApiKey });
  const generationDeps = buildGenerationDeps(db);
  const reviewDeps = buildReviewDeps({ db, llmAdapter: opts.llmAdapter, anthropicApiKey: opts.anthropicApiKey });
  const progressDeps = buildProgressDeps(db);

  const app = Fastify({ logger: true });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  void app.register(cookie);
  void app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES + 1 } });
  void app.register(dbPlugin, { db });
  // Registered directly on the root app (not nested in another plugin) and
  // wrapped in fastify-plugin: its requireAuth decorator and its onRequest
  // hook are therefore visible fastify-wide, to every route registered
  // anywhere in the tree, including ones registered after this call.
  void app.register(authPlugin, {
    sessionCodec: identityDeps.sessionCodec,
    userRepository: identityDeps.userRepository,
    clock: systemClock,
  });
  void app.register(authRoutes, {
    authenticateDeps: identityDeps.authenticateDeps,
    clock: systemClock,
    cookieSecure: opts.cookieSecure,
  });
  void app.register(meRoutes);
  void app.register(healthRoutes);
  void app.register(documentsRoutes, {
    repo: ingestionDeps.repo,
    fileStore: ingestionDeps.fileStore,
    jobQueue,
    idGenerator: ingestionDeps.idGenerator,
    clock: systemClock,
  });
  void app.register(notionsRoutes, {
    repo: contentDeps.repo,
    markNotionStale: (userId: string, notionId: string) => markStale({ repo: generationDeps.repo }, userId, notionId),
  });
  void app.register(cardsRoutes, {
    cardRepo: generationDeps.repo,
    notionRepo: contentDeps.repo,
    jobQueue,
    clock: systemClock,
  });
  void app.register(reviewRoutes, {
    repo: reviewDeps.repo,
    cardRepo: generationDeps.repo,
    grader: reviewDeps.grader,
    idGenerator: uuidV7Generator,
    clock: systemClock,
  });
  void app.register(progressRoutes, {
    repo: progressDeps.repo,
    documentRepo: ingestionDeps.repo,
    idGenerator: uuidV7Generator,
    clock: systemClock,
  });

  if (opts.webDistPath) {
    void app.register(staticPlugin, {
      root: opts.webDistPath,
      wildcard: false,
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        void reply.code(404).send({ error: "not_found" });
        return;
      }
      void reply.sendFile("index.html");
    });
  }

  return app;
}
