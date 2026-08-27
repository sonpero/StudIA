import type { NotionRepository } from "../../content/index.js";
import type { JobContext, JobError } from "../../jobs/index.js";
import { ok, type IdGenerator, type Result } from "../../shared/index.js";
import { diffCards } from "../domain/diff-cards.js";
import { isValidCardCount } from "../domain/is-valid-card-count.js";
import { questionLeaksAnswer } from "../domain/question-leaks-answer.js";
import type { CardGenerator, CardRepository } from "../domain/ports.js";
import type { Card, CardType } from "../domain/types.js";

export interface HandleGenerationJobDeps {
  cardRepo: CardRepository;
  notionRepo: NotionRepository;
  generator: CardGenerator;
  idGenerator: IdGenerator;
}

export interface GenerateCardsPayload {
  notionId: string;
  types: CardType[];
  // Carried only for GET .../generation-status's filter (generate-for-notion.ts);
  // the handler itself never reads it, it always resolves the notion by id.
  documentId?: string;
}

// One job per notion, enqueued when the user requests generation
// (docs/modules/generation.md — never triggered automatically after
// splitting). Idempotent: applyCardChanges replaces cards for that notion
// via diff-cards.ts, preserving ids (and therefore review history) for
// unchanged questions. No LLM call happens inside a transaction: the
// generate() call below is a plain awaited call, not wrapped in any write
// transaction — only the repository's own applyCardChanges is.
export async function handleGenerationJob(
  deps: HandleGenerationJobDeps,
  payload: GenerateCardsPayload,
  ctx: JobContext,
): Promise<Result<void, JobError>> {
  const notion = await deps.notionRepo.findNotion(ctx.userId, payload.notionId);
  if (!notion) return { ok: false, error: `Notion ${payload.notionId} not found for user ${ctx.userId}` };

  const result = await deps.generator.generate({
    notion: { title: notion.title, body: notion.body, difficulty: notion.difficulty },
    types: payload.types,
  });
  if (!result.ok) return { ok: false, error: result.error.message };

  if (!isValidCardCount(result.value.length)) {
    return { ok: false, error: `Generation produced ${String(result.value.length)} cards, expected 1 to 5` };
  }
  const leaking = result.value.find((c) => questionLeaksAnswer(c.question, c.answer));
  if (leaking) return { ok: false, error: `Question leaks its answer: "${leaking.question}"` };

  const existing = await deps.cardRepo.listCards(ctx.userId, payload.notionId);
  const { actions, deleteIds } = diffCards(existing, result.value);

  const nowIso = ctx.now.toISOString();
  const existingById = new Map(existing.map((c) => [c.id, c]));
  const upsert: Card[] = actions.map((action) => {
    const id = action.action === "keep" ? action.id : deps.idGenerator.next();
    const createdAt = action.action === "keep" ? (existingById.get(action.id)?.createdAt ?? nowIso) : nowIso;
    return {
      id,
      notionId: payload.notionId,
      userId: ctx.userId,
      type: action.generated.type,
      state: "active",
      question: action.generated.question,
      answer: action.generated.answer,
      options: action.generated.options,
      createdAt,
    };
  });

  await deps.cardRepo.applyCardChanges(ctx.userId, payload.notionId, upsert, deleteIds);
  return ok(undefined);
}
