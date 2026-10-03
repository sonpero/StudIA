export type { Card, CardType, CardState, GeneratedCard, KeyNotion, KeyNotionCardLink, KeyNotionImportance } from "./domain/types.js";
export type { CardRepository, GenerationError, KeyNotionRepository } from "./domain/ports.js";
// For the eval script's distractor-quality measurement (docs/MILESTONES.md M4).
export { answerAmongOptions, areOptionsDistinct, optionLengthsArePlausible } from "./domain/mcq-invariants.js";

export { markStale, type MarkStaleDeps } from "./application/mark-stale.js";
export { listCards, type ListCardsDeps } from "./application/list-cards.js";
export { deleteCard, type DeleteCardDeps } from "./application/delete-card.js";
export { getGenerationStatus, type GetGenerationStatusDeps } from "./application/get-generation-status.js";
export {
  requestCourseCards,
  COURSE_GENERATION_JOB_TYPE,
  type RequestCourseCardsDeps,
  type RequestCourseCardsError,
} from "./application/request-course-cards.js";
export {
  handleCourseGenerationJob,
  type HandleCourseGenerationJobDeps,
  type GenerateCourseCardsPayload,
  type CourseGenerationJobResult,
} from "./application/handle-course-generation-job.js";
export type { KeyNotionExtractor, KeyNotionCardGenerator, KeyNotionExtraction, KeyNotionExtractionInput, CardBatchInput } from "./domain/ports.js";
// The eval suite reads the budget and the plan types to check its bounds.
export { CARD_BUDGET, cardBudget, type CardBudget } from "./domain/card-budget.js";
export { normalizeKeyNotionTitle, type KeyNotionCandidate, type PlannedCard } from "./domain/key-notion-plan.js";

export { SqliteCardRepository, type GenerationDb } from "./infra/sqlite-card-repository.js";
export { SqliteKeyNotionRepository } from "./infra/sqlite-key-notion-repository.js";
export { ClaudeKeyNotionExtractor, KEY_NOTION_EXTRACTOR_MAX_TOKENS } from "./infra/claude-key-notion-extractor.js";
export { ClaudeKeyNotionCardGenerator, CARD_BATCH_MAX_TOKENS } from "./infra/claude-key-notion-card-generator.js";
export { FixtureKeyNotionExtractor, type FixtureCase as KeyNotionExtractorFixtureCase } from "./infra/fixture-key-notion-extractor.js";
export {
  FixtureKeyNotionCardGenerator,
  type FixtureCase as KeyNotionCardGeneratorFixtureCase,
} from "./infra/fixture-key-notion-card-generator.js";
// For apps/api/drizzle.config.ts's glob (same reason as content/ingestion/identity/jobs).
export { cardsTable } from "./infra/schema.js";
