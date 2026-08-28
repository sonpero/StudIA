import { SqlitePlanningRepository, type PlanningRepository } from "@studia/core";
import type { Db } from "./db/connection.js";

export interface PlanningDeps {
  repo: PlanningRepository;
}

export function buildPlanningDeps(db: Db): PlanningDeps {
  return { repo: new SqlitePlanningRepository(db) };
}
