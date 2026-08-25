import staticPlugin from "@fastify/static";
import Fastify from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { dbPlugin } from "./plugins/db.js";
import { healthRoutes } from "./routes/health.js";

export interface BuildAppOptions {
  databasePath: string;
  webDistPath?: string;
}

export function buildApp(opts: BuildAppOptions) {
  const app = Fastify({ logger: true });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  void app.register(dbPlugin, { databasePath: opts.databasePath });
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
