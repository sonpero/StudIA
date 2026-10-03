import type { NotionRepository } from "../../content/index.js";
import type { DocumentRepository } from "../../ingestion/index.js";
import type { JobContext, JobError } from "../../jobs/index.js";
import { ok, type IdGenerator } from "../../shared/index.js";
import { CARD_BUDGET, cardBudget } from "../domain/card-budget.js";
import { capGeneratedCards, capKeyNotions, cardTargets, dedupeKeyNotions, type PlannedCard } from "../domain/key-notion-plan.js";
import type { KeyNotionCardGenerator, KeyNotionExtractor, KeyNotionRepository } from "../domain/ports.js";
import type { Card, CardType, KeyNotionCardLink } from "../domain/types.js";

export interface HandleCourseGenerationJobDeps {
  keyNotionRepo: KeyNotionRepository;
  notionRepo: NotionRepository;
  documentRepo: DocumentRepository;
  extractor: KeyNotionExtractor;
  generator: KeyNotionCardGenerator;
  idGenerator: IdGenerator;
}

export interface GenerateCourseCardsPayload {
  documentId: string;
}

// Same shape as content's SplitJobResult: `terminal` marks a failure a
// retry cannot fix, turned into JobQueue.fail(..., { terminal: true }) by
// apps/worker's recordTerminalFailures.
export type CourseGenerationJobResult = { ok: true; value: undefined } | { ok: false; error: JobError; terminal?: true };

const CARD_TYPES: CardType[] = ["flashcard", "mcq", "open"];

// M11 (docs/reports/notions-cles-conception.md): one job per course. Reads
// the whole course, gets (or reuses) its key notions, then generates the
// cards in batches and writes them in one transaction. Never an LLM call
// inside a transaction: every extract()/generate() below is a plain awaited
// call, and only the repository's own save methods open one.
//
// Idempotent: a course with cards is never regenerated. Cards from this
// flow mean the job already ran; cards without key notions are an existing
// course from the old flow, whose review history must not be touched.
export async function handleCourseGenerationJob(
  deps: HandleCourseGenerationJobDeps,
  payload: GenerateCourseCardsPayload,
  ctx: JobContext,
): Promise<CourseGenerationJobResult> {
  const { userId } = ctx;
  const stored = await deps.keyNotionRepo.listKeyNotions(userId, payload.documentId);
  if ((await deps.keyNotionRepo.countCardsForDocument(userId, payload.documentId)) > 0) {
    if (stored.length > 0) return ok(undefined);
    return { ok: false, error: `Document ${payload.documentId} already has cards; an existing course is never regenerated`, terminal: true };
  }

  const extraction = await deps.documentRepo.getExtraction(userId, payload.documentId);
  if (!extraction) return { ok: false, error: `No extraction found for document ${payload.documentId}` };
  const readingNotions = await deps.notionRepo.listNotions(userId, payload.documentId);
  if (readingNotions.length === 0) return { ok: false, error: `Document ${payload.documentId} has no notions yet` };

  const budget = cardBudget(extraction.markdown.length);
  let keyNotions = stored;
  if (keyNotions.length === 0) {
    if (extraction.markdown.length > CARD_BUDGET.maxCourseChars) {
      return {
        ok: false,
        error: `Course is ${String(extraction.markdown.length)} characters long, over the ${String(CARD_BUDGET.maxCourseChars)} one call can read`,
        terminal: true,
      };
    }
    const extracted = await deps.extractor.extract({
      markdown: extraction.markdown,
      readingNotions: readingNotions.map((n) => ({ id: n.id, title: n.title })),
      budget,
    });
    if (!extracted.ok) {
      return extracted.error.kind === "truncated" ? { ok: false, error: extracted.error.message, terminal: true } : { ok: false, error: extracted.error.message };
    }

    const positionOf = new Map(readingNotions.map((n) => [n.id, n.position]));
    const planned = capKeyNotions(dedupeKeyNotions(extracted.value.keyNotions), budget.keyNotions.max);
    if (planned.length === 0) return { ok: false, error: `The extraction found no key notion in document ${payload.documentId}` };
    const nowIso = ctx.now.toISOString();
    keyNotions = planned.map((candidate, position) => ({
      id: deps.idGenerator.next(),
      documentId: payload.documentId,
      userId,
      title: candidate.title,
      summary: candidate.summary,
      importance: candidate.importance,
      isSynthesis: candidate.isSynthesis,
      section: extracted.value.sections[candidate.sectionIndex] ?? "",
      position,
      readingNotionIds: [...candidate.readingNotionIds].sort((a, b) => (positionOf.get(a) ?? 0) - (positionOf.get(b) ?? 0)),
      createdAt: nowIso,
    }));
    // Stored before generating: a failed generation retries without paying
    // for the extraction again.
    await deps.keyNotionRepo.saveKeyNotions(userId, keyNotions);
  }

  const targets = cardTargets(keyNotions, budget);
  const notionsById = new Map(readingNotions.map((n) => [n.id, n]));
  const generated: PlannedCard[] = [];
  for (const type of CARD_TYPES) {
    const indices = targets[type];
    const size = CARD_BUDGET.batchSize[type];
    for (let start = 0; start < indices.length; start += size) {
      const batch = indices.slice(start, start + size).map((index) => ({ index, keyNotion: keyNotions[index]! }));
      const sourceIds = [...new Set(batch.flatMap(({ keyNotion }) => keyNotion.readingNotionIds))];
      const result = await deps.generator.generate({
        type,
        keyNotions: batch.map(({ index, keyNotion }) => ({
          index,
          title: keyNotion.title,
          summary: keyNotion.summary,
          readingNotionIds: keyNotion.readingNotionIds,
        })),
        readingNotions: sourceIds.flatMap((id) => {
          const notion = notionsById.get(id);
          return notion ? [{ id, title: notion.title, body: notion.body }] : [];
        }),
      });
      if (!result.ok) return { ok: false, error: result.error.message };
      generated.push(...result.value);
    }
  }

  const nowIso = ctx.now.toISOString();
  const cards: Card[] = [];
  const links: KeyNotionCardLink[] = [];
  for (const planned of capGeneratedCards(generated, targets)) {
    const keyNotion = keyNotions[planned.keyNotionIndex];
    const notionId = keyNotion?.readingNotionIds[0];
    // A key notion whose every reading notion was deleted since: nothing
    // left to attach the card to.
    if (!keyNotion || !notionId) continue;
    const id = deps.idGenerator.next();
    cards.push({
      id,
      notionId,
      userId,
      type: planned.type,
      state: "active",
      question: planned.question,
      answer: planned.answer,
      // Stored in the order generated: the review screen shuffles them at
      // each presentation, the one place options are ordered.
      options: planned.options,
      createdAt: nowIso,
    });
    links.push({ cardId: id, keyNotionId: keyNotion.id });
  }

  await deps.keyNotionRepo.saveCourseCards(userId, cards, links);
  return ok(undefined);
}

