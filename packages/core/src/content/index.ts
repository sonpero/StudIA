export type { Difficulty, Notion, SplitNotion } from "./domain/types.js";
export type { NotionRepository, NotionSplitter, SplitError, SplitInput } from "./domain/ports.js";

export { handleSplitJob, type HandleSplitJobDeps, type SplitDocumentPayload, type SplitJobResult } from "./application/handle-split-job.js";
export { listNotions, type ListNotionsDeps } from "./application/list-notions.js";
export { updateNotion, type UpdateNotionDeps, type UpdateNotionError, type UpdateNotionPatch } from "./application/update-notion.js";
export { reorderNotions, type ReorderNotionsDeps } from "./application/reorder-notions.js";
export { deleteNotion, type DeleteNotionDeps } from "./application/delete-notion.js";
export { searchNotions, type SearchNotionsDeps } from "./application/search-notions.js";
export type { NotionStepStatus, DocumentNotionStepStatus } from "./domain/notion-step-status.js";
export { listNotionStatuses, type ListNotionStatusesDeps } from "./application/list-notion-statuses.js";
export { retryNotionSplit, type RetryNotionSplitDeps } from "./application/retry-notion-split.js";

export { SqliteNotionRepository, type ContentDb } from "./infra/sqlite-notion-repository.js";
export { FixtureNotionSplitter, type FixtureCase as NotionSplitterFixtureCase } from "./infra/fixture-notion-splitter.js";
export { ClaudeNotionSplitter } from "./infra/claude-notion-splitter.js";
// For apps/api/drizzle.config.ts's glob (same reason as ingestion/identity/jobs).
export { notionsTable } from "./infra/schema.js";
