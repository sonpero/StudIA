import type { DocumentRepository } from "../../ingestion/index.js";
import type { JobContext, JobError } from "../../jobs/index.js";
import { ok, type IdGenerator } from "../../shared/index.js";
import { chunkBySize, DEFAULT_CHUNKING, type ChunkingOptions } from "../domain/chunk-by-size.js";
import { disambiguateTitles, sectionLabel, type TitleSource } from "../domain/disambiguate-titles.js";
import { isValidNotionCount, maxNotionCount, MIN_NOTIONS } from "../domain/is-valid-notion-count.js";
import { isValidTitle } from "../domain/is-valid-title.js";
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

  const splitNotions: SplitNotion[] = [];
  const sources: TitleSource[] = [];
  for (const [index, chunk] of chunks.entries()) {
    const result = await deps.splitter.split({ markdown: chunk, avoidTitles: splitNotions.map((n) => n.title) });
    if (!result.ok) {
      return result.error.kind === "truncated" ? { ok: false, error: result.error.message, terminal: true } : { ok: false, error: result.error.message };
    }
    const section = sectionLabel(chunk);
    for (const notion of result.value) {
      splitNotions.push(notion);
      sources.push({ title: notion.title, section, part: index + 1 });
    }
  }

  const markdownLength = extraction.markdown.length;
  if (!isValidNotionCount(splitNotions.length, markdownLength)) {
    return {
      ok: false,
      error: `Splitting produced ${String(splitNotions.length)} notions, expected ${String(MIN_NOTIONS)} to ${String(maxNotionCount(markdownLength))}`,
    };
  }
  const invalidTitle = splitNotions.find((n) => !isValidTitle(n.title));
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
