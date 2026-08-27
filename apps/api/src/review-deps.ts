import { SqliteReviewRepository, type ReviewRepository } from "@studia/core";
import type { Db } from "./db/connection.js";

export interface ReviewDeps {
  repo: ReviewRepository;
}

export function buildReviewDeps(db: Db): ReviewDeps {
  return { repo: new SqliteReviewRepository(db) };
}
