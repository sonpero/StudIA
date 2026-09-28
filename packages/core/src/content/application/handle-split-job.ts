import type { DocumentRepository } from "../../ingestion/index.js";
import type { JobContext, JobError } from "../../jobs/index.js";
import { ok, type IdGenerator } from "../../shared/index.js";
import { chunkBySize, DEFAULT_CHUNKING, type ChunkingOptions } from "../domain/chunk-by-size.js";
import { disambiguateTitles, sectionLabel, type TitleSource } from "../domain/disambiguate-titles.js";
import { isValidNotionCount, maxNotionCount, MIN_NOTIONS } from "../domain/is-valid-notion-count.js";
import { fitTitle } from "../domain/fit-title.js";
import { isTitleTooShort } from "../domain/is-valid-title.js";
import { notionBudgets } from "../domain/notion-budget.js";
import { notionCountTarget } from "../domain/notion-count-target.js";
import type { NotionRepository, NotionSplitter } from "../domain/ports.js";
import type { Notion, SplitNotion } from "../domain/types.js";

export interface HandleSplitJobDeps {
  notionRepo: NotionRepository;
  documentRepo: DocumentRepository;
  splitter: NotionSplitter;
  idGenerator: IdGenerator;
  // Defaults to DEFAULT_CHUNKING; only tests shrink it, to exercise several
  // chunks with a few-line document.
  chunking?: ChunkingOptions;
}

export interface SplitDocumentPayload {
  documentId: string;
}

// `terminal: true` marks a failure that retrying cannot fix (the model's
// output was truncated: same input, same truncation, billed again). The jobs
// kernel's JobHandler contract has no way to carry this (JobError is a plain
// string), so the flag rides alongside it and apps/worker turns it into
// JobQueue.fail(..., { terminal: true }). A handler that ignores the flag
// still gets a valid Result<void, JobError>.
export type SplitJobResult = { ok: true; value: undefined } | { ok: false; error: JobError; terminal?: true };

// Enqueued by ingestion on extraction success (docs/modules/content.md).
// Reads the extraction, chunks it by size, calls the splitter per chunk
// (telling it the titles earlier chunks produced), resolves any title still
// repeated across chunks, renumbers positions globally, then validates and
// writes. Idempotent: replaceNotionsForDocument deletes any existing notions
// for the document before inserting, so running this twice after a worker
// restart leaves exactly one set. No LLM call happens inside a transaction:
// every split() call below is a plain awaited call, not wrapped in any write
// transaction.
export async function handleSplitJob(deps: HandleSplitJobDeps, payload: SplitDocumentPayload, ctx: JobContext): Promise<SplitJobResult> {
  const extraction = await deps.documentRepo.getExtraction(ctx.userId, payload.documentId);
  if (!extraction) return { ok: false, error: `No extraction found for document ${payload.documentId}` };

  const chunks = chunkBySize(extraction.markdown, deps.chunking ?? DEFAULT_CHUNKING);
  if (chunks.length === 0) return { ok: false, error: "Extraction is empty, nothing to split" };

  const budgets = notionBudgets(
    chunks.map((chunk) => chunk.length),
    maxNotionCount(extraction.markdown.length),
  );
  const splitNotions: SplitNotion[] = [];
  const sources: TitleSource[] = [];
  for (const [index, chunk] of chunks.entries()) {
    const budget = budgets[index];
    const result = await deps.splitter.split({
      markdown: chunk,
      avoidTitles: splitNotions.map((n) => n.title),
      targetNotions: notionCountTarget(chunk.length, { onlyChunk: chunks.length === 1, budget }),
      maxNotions: budget,
    });
    if (!result.ok) {
      return result.error.kind === "truncated" ? { ok: false, error: result.error.message, terminal: true } : { ok: false, error: result.error.message };
    }
    const section = sectionLabel(chunk);
    for (const notion of result.value) {
      // Before disambiguateTitles: shortening can make two titles equal.
      const title = fitTitle(notion.title);
      splitNotions.push({ ...notion, title });
      sources.push({ title, section, part: index + 1 });
    }
  }

  const markdownLength = extraction.markdown.length;
  if (!isValidNotionCount(splitNotions.length, markdownLength)) {
    const error = `Splitting produced ${String(splitNotions.length)} notions, expected ${String(MIN_NOTIONS)} to ${String(maxNotionCount(markdownLength))}`;
    // Too many is terminal: every chunk has already been paid for, and a
    // full re-split of the same text overshoots again (A2A: 315 for a cap of
    // 131). Too few stays retryable: that is where a model that mostly
    // failed to split can do better on a second attempt.
    return splitNotions.length > maxNotionCount(markdownLength) ? { ok: false, error, terminal: true } : { ok: false, error };
  }
  // Length above 80 never fails a document (fitTitle); only an empty-ish
  // title still does.
  const invalidTitle = splitNotions.find((n) => isTitleTooShort(n.title));
  if (invalidTitle) return { ok: false, error: `Invalid notion title: "${invalidTitle.title}"` };
  const titles = disambiguateTitles(sources);

  const nowIso = ctx.now.toISOString();
  const notions: Notion[] = splitNotions.map((n, position) => ({
    id: deps.idGenerator.next(),
    documentId: payload.documentId,
    userId: ctx.userId,
    title: titles[position] ?? n.title,
    body: n.body,
    difficulty: n.difficulty,
    position,
    createdAt: nowIso,
  }));

  await deps.notionRepo.replaceNotionsForDocument(ctx.userId, payload.documentId, notions);
  return ok(undefined);
}
