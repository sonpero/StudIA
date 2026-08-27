import { SqliteCardRepository, type CardRepository } from "@studia/core";
import type { Db } from "./db/connection.js";

export interface GenerationDeps {
  repo: CardRepository;
}

export function buildGenerationDeps(db: Db): GenerationDeps {
  return { repo: new SqliteCardRepository(db) };
}
