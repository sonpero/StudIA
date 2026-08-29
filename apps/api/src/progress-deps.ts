import { SqliteProgressRepository, type ProgressRepository } from "@studia/core";
import type { Db } from "./db/connection.js";

export interface ProgressDeps {
  repo: ProgressRepository;
}

export function buildProgressDeps(db: Db): ProgressDeps {
  return { repo: new SqliteProgressRepository(db) };
}
