import type { IdGenerator } from "../../shared/index.js";
import type { PlanningRepository } from "../domain/ports.js";

export interface SetDeadlineDeps {
  repo: PlanningRepository;
  idGenerator: IdGenerator;
}

export async function setDeadline(deps: SetDeadlineDeps, userId: string, documentId: string, date: string, now: Date, label?: string): Promise<void> {
  const existing = await deps.repo.getDeadline(userId, documentId);
  await deps.repo.setDeadline(userId, {
    id: existing?.id ?? deps.idGenerator.next(),
    documentId,
    userId,
    date,
    label: label ?? null,
    createdAt: now.toISOString(),
  });
}
