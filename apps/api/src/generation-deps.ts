import { SqliteCardRepository, SqliteKeyNotionRepository, type CardRepository, type KeyNotionRepository } from "@studia/core";
import type { Db } from "./db/connection.js";

export interface GenerationDeps {
  repo: CardRepository;
  keyNotionRepo: KeyNotionRepository;
}

export function buildGenerationDeps(db: Db): GenerationDeps {
  return { repo: new SqliteCardRepository(db), keyNotionRepo: new SqliteKeyNotionRepository(db) };
}
