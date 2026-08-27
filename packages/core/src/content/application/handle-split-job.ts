import type { DocumentRepository } from "../../ingestion/index.js";
import type { JobContext, JobError } from "../../jobs/index.js";
import { ok, type IdGenerator, type Result } from "../../shared/index.js";
import { chunkByTopLevelHeadings } from "../domain/chunk-markdown.js";
import { hasDuplicateTitles } from "../domain/has-duplicate-titles.js";
import { isValidNotionCount } from "../domain/is-valid-notion-count.js";
import { isValidTitle } from "../domain/is-valid-title.js";
import type { NotionRepository, NotionSplitter } from "../domain/ports.js";
import type { Notion, SplitNotion } from "../domain/types.js";

export interface HandleSplitJobDeps {
  notionRepo: NotionRepository;
  documentRepo: DocumentRepository;
  splitter: NotionSplitter;
  idGenerator: IdGenerator;
}

export interface SplitDocumentPayload {
  documentId: string;
}

// Enqueued by ingestion on extraction success (docs/modules/content.md).
// Reads the extraction, chunks on top-level headings, calls the splitter per
// chunk, renumbers positions globally, then validates and writes. Idempotent:
// replaceNotionsForDocument deletes any existing notions for the document
// before inserting, so running this twice after a worker restart leaves
// exactly one set. No LLM call happens inside a transaction: every split()
// call below is a plain awaited call, not wrapped in any write transaction.
export async function handleSplitJob(
  deps: HandleSplitJobDeps,
  payload: SplitDocumentPayload,
  ctx: JobContext,
): Promise<Result<void, JobError>> {
  const extraction = await deps.documentRepo.getExtraction(ctx.userId, payload.documentId);
  if (!extraction) return { ok: false, error: `No extraction found for document ${payload.documentId}` };

  const chunks = chunkByTopLevelHeadings(extraction.markdown);
  if (chunks.length === 0) return { ok: false, error: "Extraction is empty, nothing to split" };

  const splitNotions: SplitNotion[] = [];
  for (const chunk of chunks) {
    const result = await deps.splitter.split({ markdown: chunk });
    if (!result.ok) return { ok: false, error: result.error.message };
    splitNotions.push(...result.value);
  }

  if (!isValidNotionCount(splitNotions.length)) {
    return { ok: false, error: `Splitting produced ${String(splitNotions.length)} notions, expected 5 to 60` };
  }
  if (hasDuplicateTitles(splitNotions.map((n) => n.title))) {
    return { ok: false, error: "Splitting produced duplicate notion titles across the document" };
  }
  const invalidTitle = splitNotions.find((n) => !isValidTitle(n.title));
  if (invalidTitle) return { ok: false, error: `Invalid notion title: "${invalidTitle.title}"` };

  const nowIso = ctx.now.toISOString();
  const notions: Notion[] = splitNotions.map((n, position) => ({
    id: deps.idGenerator.next(),
    documentId: payload.documentId,
    userId: ctx.userId,
    title: n.title,
    body: n.body,
    difficulty: n.difficulty,
    position,
    createdAt: nowIso,
  }));

  await deps.notionRepo.replaceNotionsForDocument(ctx.userId, payload.documentId, notions);
  return ok(undefined);
}
