import { ClaudeAnswerGrader, FixtureAnswerGrader, SqliteReviewRepository, createLanguageModel, type AnswerGrader, type ReviewRepository } from "@studia/core";
import type { Db } from "./db/connection.js";

export interface ReviewDeps {
  repo: ReviewRepository;
  grader: AnswerGrader;
}

export interface BuildReviewDepsOptions {
  db: Db;
  llmAdapter: "fixture" | "real";
  anthropicApiKey?: string;
}

export function buildReviewDeps(opts: BuildReviewDepsOptions): ReviewDeps {
  const grader: AnswerGrader =
    opts.llmAdapter === "fixture"
      ? new FixtureAnswerGrader("correct")
      : new ClaudeAnswerGrader(createLanguageModel({ apiKey: opts.anthropicApiKey ?? "" }));

  return { repo: new SqliteReviewRepository(opts.db), grader };
}
