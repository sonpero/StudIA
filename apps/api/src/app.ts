import cookie from "@fastify/cookie";
import staticPlugin from "@fastify/static";
import { systemClock } from "@studia/core";
import Fastify from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { openDatabase } from "./db/connection.js";
import { runMigrations } from "./db/migrate.js";
import { buildIdentityDeps } from "./identity-deps.js";
import { authPlugin } from "./plugins/auth.js";
import { dbPlugin } from "./plugins/db.js";
import { authRoutes } from "./routes/auth.js";
import { healthRoutes } from "./routes/health.js";
import { meRoutes } from "./routes/me.js";

export interface BuildAppOptions {
  databasePath: string;
  webDistPath?: string;
  sessionSecret: string;
  cookieSecure: boolean;
}

export function buildApp(opts: BuildAppOptions) {
  if (!opts.sessionSecret) {
    throw new Error(
      "SESSION_SECRET must be set (see CLAUDE.md and docs/modules/identity.md). Refusing to start without it.",
    );
  }

  const db = openDatabase(opts.databasePath);
  runMigrations(db);
  const identityDeps = buildIdentityDeps(db, opts.sessionSecret);

  const app = Fastify({ logger: true });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  void app.register(cookie);
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
