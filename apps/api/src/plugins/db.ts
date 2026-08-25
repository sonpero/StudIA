import fp from "fastify-plugin";
import type { FastifyInstance, FastifyPluginCallback } from "fastify";
import { openDatabase, type Db } from "../db/connection.js";
import { runMigrations } from "../db/migrate.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
  }
}

export interface DbPluginOptions {
  databasePath: string;
}

const plugin: FastifyPluginCallback<DbPluginOptions> = (
  app: FastifyInstance,
  opts: DbPluginOptions,
  done: (err?: Error) => void,
) => {
  const db = openDatabase(opts.databasePath);
  runMigrations(db);
  app.decorate("db", db);
  done();
};

export const dbPlugin = fp(plugin);
