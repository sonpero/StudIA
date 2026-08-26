import fp from "fastify-plugin";
import type { FastifyInstance, FastifyPluginCallback } from "fastify";
import type { Db } from "../db/connection.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
  }
}

export interface DbPluginOptions {
  db: Db;
}

// Takes an already-open, already-migrated Db rather than a path: opening and
// migrating are synchronous (better-sqlite3, drizzle's migrator), so app.ts
// does them before any plugin registration, letting identity's repositories
// be wired up synchronously too instead of waiting on Fastify's async plugin
// boot.
const plugin: FastifyPluginCallback<DbPluginOptions> = (
  app: FastifyInstance,
  opts: DbPluginOptions,
  done: (err?: Error) => void,
) => {
  app.decorate("db", opts.db);
  done();
};

export const dbPlugin = fp(plugin);
