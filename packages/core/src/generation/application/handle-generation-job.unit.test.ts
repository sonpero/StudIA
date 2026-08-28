import { describe, expect, it } from "vitest";
import { err, ok, uuidV7Generator } from "../../shared/index.js";
import type { Notion } from "../../content/index.js";
import { fakeCardGenerator, fakeCardRepository, fakeNotionRepositoryForGeneration } from "./fakes.js";
import { handleGenerationJob } from "./handle-generation-job.js";
import type { Card } from "../domain/types.js";

const now = new Date("2026-01-01T00:00:00.000Z");

function aNotion(overrides: Partial<Notion> = {}): Notion {
  return {
    id: "n1",
    documentId: "doc-1",
    userId: "u1",
    title: "Photosynthèse",
    body: "Corps.",
    difficulty: "medium",
    position: 0,
    createdAt: now.toISOString(),
    ...overrides,
  };
}

function aCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "c1",
    notionId: "n1",
    userId: "u1",
    type: "flashcard",
    state: "active",
    question: "Question ?",
    answer: "Réponse",
    options: null,
    createdAt: now.toISOString(),
    ...overrides,
  };
}

describe("handleGenerationJob", () => {
  it("writes generated cards for the notion", async () => {
    const cardRepo = fakeCardRepository();
    const notionRepo = fakeNotionRepositoryForGeneration(aNotion());
    const generator = fakeCardGenerator(() =>
      Promise.resolve(ok([{ type: "flashcard", question: "Que produit-elle ?", answer: "De l'oxygène", options: null }])),
    );

    const result = await handleGenerationJob(
      { cardRepo, notionRepo, generator, idGenerator: uuidV7Generator },
      { notionId: "n1", types: ["flashcard"] },
      { jobId: "j1", userId: "u1", attempt: 1, now },
    );

    expect(result).toEqual({ ok: true, value: undefined });
    const cards = await cardRepo.listCards("u1", "n1");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ notionId: "n1", userId: "u1", type: "flashcard", state: "active", question: "Que produit-elle ?" });
  });

  it("is idempotent: running it twice with the same output leaves exactly one set of cards, same ids", async () => {
    const cardRepo = fakeCardRepository();
    const notionRepo = fakeNotionRepositoryForGeneration(aNotion());
    const generator = fakeCardGenerator(() =>
      Promise.resolve(ok([{ type: "flashcard", question: "Q ?", answer: "R", options: null }])),
    );
    const deps = { cardRepo, notionRepo, generator, idGenerator: uuidV7Generator };
    const payload = { notionId: "n1", types: ["flashcard" as const] };
    const ctx = { jobId: "j1", userId: "u1", attempt: 1, now };

    await handleGenerationJob(deps, payload, ctx);
    const firstIds = (await cardRepo.listCards("u1", "n1")).map((c) => c.id);
    await handleGenerationJob(deps, payload, ctx);
    const secondIds = (await cardRepo.listCards("u1", "n1")).map((c) => c.id);

    expect(secondIds).toEqual(firstIds);
    expect(await cardRepo.listCards("u1", "n1")).toHaveLength(1);
  });

  it("regenerating preserves the id of a card whose question is unchanged (protects review history)", async () => {
    const cardRepo = fakeCardRepository([aCard({ id: "keep-me", question: "Q stable ?" })]);
    const notionRepo = fakeNotionRepositoryForGeneration(aNotion());
    const generator = fakeCardGenerator(() =>
      Promise.resolve(
        ok([
          { type: "flashcard", question: "Q stable ?", answer: "Réponse", options: null },
          { type: "flashcard", question: "Nouvelle question ?", answer: "Autre réponse", options: null },
        ]),
      ),
    );

    await handleGenerationJob(
      { cardRepo, notionRepo, generator, idGenerator: uuidV7Generator },
      { notionId: "n1", types: ["flashcard"] },
      { jobId: "j1", userId: "u1", attempt: 1, now },
    );

    const cards = await cardRepo.listCards("u1", "n1");
    expect(cards.find((c) => c.question === "Q stable ?")?.id).toBe("keep-me");
    expect(cards).toHaveLength(2);
  });

  it("fails the job, without writing anything, when a question leaks its answer", async () => {
    const cardRepo = fakeCardRepository();
    const notionRepo = fakeNotionRepositoryForGeneration(aNotion());
    const generator = fakeCardGenerator(() =>
      Promise.resolve(ok([{ type: "flashcard", question: "Que produit la photosynthèse ?", answer: "photosynthèse", options: null }])),
    );

    const result = await handleGenerationJob(
      { cardRepo, notionRepo, generator, idGenerator: uuidV7Generator },
      { notionId: "n1", types: ["flashcard"] },
      { jobId: "j1", userId: "u1", attempt: 1, now },
    );

    expect(result.ok).toBe(false);
    expect(await cardRepo.listCards("u1", "n1")).toHaveLength(0);
  });

  it("fails the job when the generated card count is outside 1-5", async () => {
    const cardRepo = fakeCardRepository();
    const notionRepo = fakeNotionRepositoryForGeneration(aNotion());
    const generator = fakeCardGenerator(() => Promise.resolve(ok([])));

    const result = await handleGenerationJob(
      { cardRepo, notionRepo, generator, idGenerator: uuidV7Generator },
      { notionId: "n1", types: ["flashcard"] },
      { jobId: "j1", userId: "u1", attempt: 1, now },
    );

    expect(result.ok).toBe(false);
  });

  it("checks the 1-5 card count per requested type, not the combined total: 3 flashcards + 3 mcq (6 total) succeeds", async () => {
    const cardRepo = fakeCardRepository();
    const notionRepo = fakeNotionRepositoryForGeneration(aNotion());
    const generator = fakeCardGenerator(() =>
      Promise.resolve(
        ok([
          { type: "flashcard", question: "Q1 ?", answer: "R1", options: null },
          { type: "flashcard", question: "Q2 ?", answer: "R2", options: null },
          { type: "flashcard", question: "Q3 ?", answer: "R3", options: null },
          { type: "mcq", question: "Q4 ?", answer: "Bon", options: ["Bon", "A", "B", "C"] },
          { type: "mcq", question: "Q5 ?", answer: "Bon", options: ["Bon", "A", "B", "C"] },
          { type: "mcq", question: "Q6 ?", answer: "Bon", options: ["Bon", "A", "B", "C"] },
        ]),
      ),
    );

    const result = await handleGenerationJob(
      { cardRepo, notionRepo, generator, idGenerator: uuidV7Generator },
      { notionId: "n1", types: ["flashcard", "mcq"] },
      { jobId: "j1", userId: "u1", attempt: 1, now },
    );

    expect(result).toEqual({ ok: true, value: undefined });
    expect(await cardRepo.listCards("u1", "n1")).toHaveLength(6);
  });

  it("fails when one requested type produced zero cards, even though another type's count is valid", async () => {
    const cardRepo = fakeCardRepository();
    const notionRepo = fakeNotionRepositoryForGeneration(aNotion());
    const generator = fakeCardGenerator(() =>
      Promise.resolve(ok([{ type: "flashcard", question: "Q1 ?", answer: "R1", options: null }])),
    );

    const result = await handleGenerationJob(
      { cardRepo, notionRepo, generator, idGenerator: uuidV7Generator },
      { notionId: "n1", types: ["flashcard", "open"] },
      { jobId: "j1", userId: "u1", attempt: 1, now },
    );

    expect(result.ok).toBe(false);
    expect(await cardRepo.listCards("u1", "n1")).toHaveLength(0);
  });

  it("fails the job when the generator itself errors", async () => {
    const cardRepo = fakeCardRepository();
    const notionRepo = fakeNotionRepositoryForGeneration(aNotion());
    const generator = fakeCardGenerator(() => Promise.resolve(err({ kind: "model-error", message: "boom" })));

    const result = await handleGenerationJob(
      { cardRepo, notionRepo, generator, idGenerator: uuidV7Generator },
      { notionId: "n1", types: ["flashcard"] },
      { jobId: "j1", userId: "u1", attempt: 1, now },
    );

    expect(result).toEqual({ ok: false, error: "boom" });
  });

  it("fails the job when the notion does not exist", async () => {
    const cardRepo = fakeCardRepository();
    const notionRepo = fakeNotionRepositoryForGeneration(null);
    const generator = fakeCardGenerator();

    const result = await handleGenerationJob(
      { cardRepo, notionRepo, generator, idGenerator: uuidV7Generator },
      { notionId: "ghost", types: ["flashcard"] },
      { jobId: "j1", userId: "u1", attempt: 1, now },
    );

    expect(result.ok).toBe(false);
  });
});
