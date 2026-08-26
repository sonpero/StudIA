import { meResponseSchema } from "@studia/contracts";
import type { FastifyPluginCallback } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

export const meRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/api/me",
    { schema: { response: { 200: meResponseSchema } } },
    (request) => {
      // Not marked config.public: the global requireAuth hook (plugins/auth.ts)
      // already returned 401 and short-circuited if there was no valid
      // session, so request.user is guaranteed set here.
      const user = request.user!;
      return { id: user.id, username: user.username };
    },
  );
  done();
};
