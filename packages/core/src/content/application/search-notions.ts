import type { NotionRepository } from "../domain/ports.js";
import type { Notion } from "../domain/types.js";

export interface SearchNotionsDeps {
  repo: NotionRepository;
}

// FTS5, scoped to the user (docs/modules/content.md).
export function searchNotions(deps: SearchNotionsDeps, userId: string, query: string): Promise<Notion[]> {
  return deps.repo.searchNotions(userId, query);
}
