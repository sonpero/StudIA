export type { Card, CardType, CardState, GeneratedCard } from "./domain/types.js";
export type { CardGenerator, CardRepository, GenerationError } from "./domain/ports.js";

export { handleGenerationJob, type HandleGenerationJobDeps, type GenerateCardsPayload } from "./application/handle-generation-job.js";
export { generateForNotion, type GenerateForNotionDeps } from "./application/generate-for-notion.js";
export { markStale, type MarkStaleDeps } from "./application/mark-stale.js";
export { listCards, type ListCardsDeps } from "./application/list-cards.js";
export { deleteCard, type DeleteCardDeps } from "./application/delete-card.js";
export { getGenerationStatus, type GetGenerationStatusDeps } from "./application/get-generation-status.js";

export { SqliteCardRepository, type GenerationDb } from "./infra/sqlite-card-repository.js";
export { FixtureCardGenerator, type FixtureCase as CardGeneratorFixtureCase } from "./infra/fixture-card-generator.js";
export { ClaudeCardGenerator } from "./infra/claude-card-generator.js";
// For apps/api/drizzle.config.ts's glob (same reason as content/ingestion/identity/jobs).
export { cardsTable } from "./infra/schema.js";
