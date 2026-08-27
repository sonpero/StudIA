import type { NotionRepository } from "../domain/ports.js";
import type { Notion } from "../domain/types.js";

export interface ListNotionsDeps {
  repo: NotionRepository;
}

export function listNotions(deps: ListNotionsDeps, userId: string, documentId: string): Promise<Notion[]> {
  return deps.repo.listNotions(userId, documentId);
}
