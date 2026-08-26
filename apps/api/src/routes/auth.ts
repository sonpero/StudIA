import { loginRequestSchema } from "@studia/contracts";
import { authenticate, type AuthenticateDeps, type Clock } from "@studia/core";
import type { FastifyPluginCallback } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { SESSION_COOKIE_NAME } from "../plugins/auth.js";

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

export interface AuthRoutesOptions {
  authenticateDeps: AuthenticateDeps;
  clock: Clock;
  cookieSecure: boolean;
}

export const authRoutes: FastifyPluginCallback<AuthRoutesOptions> = (app, opts, done) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/api/auth/login",
    { config: { public: true }, schema: { body: loginRequestSchema } },
    async (request, reply) => {
      const result = await authenticate(
        opts.authenticateDeps,
        request.body.username,
        request.body.password,
        request.ip,
        opts.clock.now(),
      );

      if (!result.ok) {
        if (result.error.kind === "rate-limited") {
          return reply
            .code(429)
            .header("Retry-After", String(result.error.retryAfterSeconds))
            .send({ error: "rate_limited" });
        }
        return reply.code(401).send({ error: "invalid_credentials" });
      }

      return reply
        .setCookie(SESSION_COOKIE_NAME, result.value.token, {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          secure: opts.cookieSecure,
          maxAge: THIRTY_DAYS_SECONDS,
        })
        .code(204)
        .send();
    },
  );

  app.post("/api/auth/logout", { config: { public: true } }, async (_request, reply) => {
    return reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" }).code(204).send();
  });

  done();
};
