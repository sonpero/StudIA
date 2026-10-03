import { describe, expect, it } from "vitest";
import { err, ok, uuidV7Generator } from "../../shared/index.js";
import type { Notion } from "../../content/index.js";
import { CARD_BUDGET } from "../domain/card-budget.js";
import type { KeyNotionCandidate } from "../domain/key-notion-plan.js";
import type { Card, KeyNotion } from "../domain/types.js";
import {
  fakeDocumentRepositoryForGeneration,
  fakeKeyNotionCardGenerator,
  fakeKeyNotionExtractor,
  fakeKeyNotionRepository,
  fakeNotionRepositoryForCourse,
} from "./fakes.js";
import { handleCourseGenerationJob } from "./handle-course-generation-job.js";
import { FixtureKeyNotionExtractor } from "../infra/fixture-key-notion-extractor.js";

const now = new Date("2026-01-01T00:00:00.000Z");
const ctx = { jobId: "j1", userId: "u1", attempt: 1, now };

function aNotion(id: string, position: number): Notion {
  return { id, documentId: "doc-1", userId: "u1", title: `Notion ${id}`, body: `Corps ${id}.`, difficulty: "medium", position, createdAt: now.toISOString() };
}

const notions = [aNotion("n1", 0), aNotion("n2", 1), aNotion("n3", 2)];

function aCandidate(overrides: Partial<KeyNotionCandidate> = {}): KeyNotionCandidate {
  return { title: "Notion clé", summary: "Résumé.", importance: "important", isSynthesis: false, sectionIndex: 0, readingNotionIds: ["n1"], ...overrides };
}

const extraction = { documentId: "doc-1", markdown: "# Cours\n\nTexte du cours.", extractedAt: now.toISOString() };

function setup(
  options: {
    candidates?: KeyNotionCandidate[];
    sections?: string[];
    keyNotions?: KeyNotion[];
    cards?: Card[];
    markdown?: string;
  } = {},
) {
  const keyNotionRepo = fakeKeyNotionRepository(notions, { keyNotions: options.keyNotions, cards: options.cards });
  const extractor = fakeKeyNotionExtractor(() =>
    Promise.resolve(
      ok({
        sections: options.sections ?? ["Partie 1"],
        keyNotions: options.candidates ?? [
          aCandidate({ title: "Essentielle", importance: "essential", readingNotionIds: ["n3", "n2"] }),
          aCandidate({ title: "Importante", readingNotionIds: ["n1"] }),
          aCandidate({ title: "Synthèse", isSynthesis: true, readingNotionIds: ["n2"] }),
        ],
      }),
    ),
  );
  const generator = fakeKeyNotionCardGenerator();
  const deps = {
    keyNotionRepo,
    notionRepo: fakeNotionRepositoryForCourse(notions),
    documentRepo: fakeDocumentRepositoryForGeneration({ ...extraction, markdown: options.markdown ?? extraction.markdown }),
    extractor,
    generator,
    idGenerator: uuidV7Generator,
  };
  return { deps, keyNotionRepo, extractor, generator };
}

describe("handleCourseGenerationJob", () => {
  it("extracts key notions, generates one flashcard each, an MCQ per essential and an open question per synthesis", async () => {
    const { deps, keyNotionRepo, extractor } = setup();

    const result = await handleCourseGenerationJob(deps, { documentId: "doc-1" }, ctx);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(extractor.calls).toHaveLength(1);
    expect(keyNotionRepo.keyNotions.map((k) => [k.title, k.position, k.section])).toEqual([
      ["Essentielle", 0, "Partie 1"],
      ["Importante", 1, "Partie 1"],
      ["Synthèse", 2, "Partie 1"],
    ]);
    const byType = (type: string) => keyNotionRepo.cards.filter((c) => c.type === type);
    expect(byType("flashcard")).toHaveLength(3);
    expect(byType("mcq")).toHaveLength(1);
    expect(byType("open")).toHaveLength(1);
    expect(keyNotionRepo.links).toHaveLength(5);
  });

  it("sends the whole course, the reading notions and the budget to the extractor", async () => {
    const { deps, extractor } = setup();
    await handleCourseGenerationJob(deps, { documentId: "doc-1" }, ctx);

    expect(extractor.calls[0]).toMatchObject({
      markdown: extraction.markdown,
      readingNotions: [
        { id: "n1", title: "Notion n1" },
        { id: "n2", title: "Notion n2" },
        { id: "n3", title: "Notion n3" },
      ],
    });
    expect(extractor.calls[0]?.budget.keyNotions).toEqual({ min: 5, max: 10 });
  });

  it("stores each key notion's reading notions in course order, and attaches its cards to the first one", async () => {
    const { deps, keyNotionRepo } = setup();
    await handleCourseGenerationJob(deps, { documentId: "doc-1" }, ctx);

    const essential = keyNotionRepo.keyNotions[0]!;
    expect(essential.readingNotionIds).toEqual(["n2", "n3"]);
    const essentialCardIds = keyNotionRepo.links.filter((l) => l.keyNotionId === essential.id).map((l) => l.cardId);
    expect(keyNotionRepo.cards.filter((c) => essentialCardIds.includes(c.id)).map((c) => c.notionId)).toEqual(["n2", "n2"]);
  });

  it("shuffles MCQ options deterministically, keeping the answer among them", async () => {
    const { deps, keyNotionRepo } = setup();
    await handleCourseGenerationJob(deps, { documentId: "doc-1" }, ctx);

    const mcq = keyNotionRepo.cards.find((c) => c.type === "mcq")!;
    expect(mcq.options).toHaveLength(4);
    expect(mcq.options).toContain(mcq.answer);
    expect([...mcq.options!].sort()).toEqual(["Leurre deux", "Leurre trois", "Leurre un", "Réponse 0"].sort());
  });

  it("merges duplicate key notions before generating", async () => {
    const { deps, keyNotionRepo } = setup({
      candidates: [aCandidate({ title: "Agent Card", readingNotionIds: ["n1"] }), aCandidate({ title: "l'agent card", readingNotionIds: ["n2"] })],
    });
    await handleCourseGenerationJob(deps, { documentId: "doc-1" }, ctx);

    expect(keyNotionRepo.keyNotions).toHaveLength(1);
    expect(keyNotionRepo.keyNotions[0]?.readingNotionIds).toEqual(["n1", "n2"]);
    expect(keyNotionRepo.cards.filter((c) => c.type === "flashcard")).toHaveLength(1);
  });

  it("caps the key notions at the budget's maximum, never past it", async () => {
    const many = Array.from({ length: 30 }, (_, i) => aCandidate({ title: `Notion ${String(i)}`, importance: "essential", isSynthesis: true }));
    const { deps, keyNotionRepo } = setup({ candidates: many });
    await handleCourseGenerationJob(deps, { documentId: "doc-1" }, ctx);

    // A short course: the one-page ranges (10 key notions, 4 MCQ, 2 open at most).
    expect(keyNotionRepo.keyNotions).toHaveLength(10);
    expect(keyNotionRepo.cards.filter((c) => c.type === "flashcard")).toHaveLength(10);
    expect(keyNotionRepo.cards.filter((c) => c.type === "mcq")).toHaveLength(4);
    expect(keyNotionRepo.cards.filter((c) => c.type === "open")).toHaveLength(2);
  });

  it("generates in batches: one call per card type and per batch of key notions", async () => {
    const many = Array.from({ length: 20 }, (_, i) => aCandidate({ title: `Notion ${String(i)}`, importance: i < 12 ? "essential" : "important" }));
    // 20 key notions fit the budget from ~4 pages on.
    const { deps, generator } = setup({ candidates: many, markdown: "x".repeat(6 * CARD_BUDGET.charsPerPage) });
    await handleCourseGenerationJob(deps, { documentId: "doc-1" }, ctx);

    const sizes = (type: string) => generator.calls.filter((c) => c.type === type).map((c) => c.keyNotions.length);
    expect(sizes("flashcard")).toEqual([15, 5]);
    expect(sizes("mcq")).toEqual([10, 1]);
    expect(sizes("open")).toEqual([]);
  });

  it("gives each batch only the reading notions its key notions cover", async () => {
    const { deps, generator } = setup({ candidates: [aCandidate({ title: "Seule", readingNotionIds: ["n3"] })] });
    await handleCourseGenerationJob(deps, { documentId: "doc-1" }, ctx);

    expect(generator.calls[0]?.readingNotions).toEqual([{ id: "n3", title: "Notion n3", body: "Corps n3." }]);
  });

  it("drops a card the model returned for a key notion its type does not target, and a second card for the same key notion", async () => {
    const { deps, keyNotionRepo } = setup({ candidates: [aCandidate({ title: "Seule", importance: "important" })] });
    deps.generator = fakeKeyNotionCardGenerator((input) =>
      Promise.resolve(
        ok([
          { keyNotionIndex: 0, type: input.type, question: "Q1 ?", answer: "R1", options: null },
          { keyNotionIndex: 0, type: input.type, question: "Q2 ?", answer: "R2", options: null },
          { keyNotionIndex: 0, type: "mcq", question: "Pas demandé ?", answer: "A", options: ["A", "B", "C", "D"] },
        ]),
      ),
    );
    await handleCourseGenerationJob(deps, { documentId: "doc-1" }, ctx);

    expect(keyNotionRepo.cards.map((c) => [c.type, c.question])).toEqual([["flashcard", "Q1 ?"]]);
  });

  it("does nothing when the course already has cards from the new flow (a job that ran twice)", async () => {
    const { deps, extractor, generator, keyNotionRepo } = setup();
    await handleCourseGenerationJob(deps, { documentId: "doc-1" }, ctx);
    const cardCount = keyNotionRepo.cards.length;

    const second = await handleCourseGenerationJob(deps, { documentId: "doc-1" }, ctx);

    expect(second.ok).toBe(true);
    expect(extractor.calls).toHaveLength(1);
    expect(generator.calls.length).toBeGreaterThan(0);
    expect(keyNotionRepo.cards).toHaveLength(cardCount);
  });

  it("never touches a course that already has cards from the old flow: fails for good, without any model call", async () => {
    const legacy: Card = {
      id: "legacy",
      notionId: "n1",
      userId: "u1",
      type: "flashcard",
      state: "active",
      question: "Ancienne ?",
      answer: "R",
      options: null,
      createdAt: now.toISOString(),
    };
    const { deps, extractor, generator, keyNotionRepo } = setup({ cards: [legacy] });

    const result = await handleCourseGenerationJob(deps, { documentId: "doc-1" }, ctx);

    expect(result).toMatchObject({ ok: false, terminal: true });
    expect(extractor.calls).toHaveLength(0);
    expect(generator.calls).toHaveLength(0);
    expect(keyNotionRepo.cards).toEqual([legacy]);
  });

  it("reuses key notions already stored for the course instead of extracting again", async () => {
    const stored: KeyNotion = {
      id: "k-stored",
      documentId: "doc-1",
      userId: "u1",
      title: "Déjà là",
      summary: "Résumé.",
      importance: "essential",
      isSynthesis: false,
      section: "Partie 1",
      position: 0,
      readingNotionIds: ["n2"],
      createdAt: now.toISOString(),
    };
    const { deps, extractor, keyNotionRepo } = setup({ keyNotions: [stored] });

    await handleCourseGenerationJob(deps, { documentId: "doc-1" }, ctx);

    expect(extractor.calls).toHaveLength(0);
    expect(keyNotionRepo.keyNotions).toEqual([stored]);
    expect(keyNotionRepo.links.every((l) => l.keyNotionId === "k-stored")).toBe(true);
    expect(keyNotionRepo.cards.map((c) => c.type).sort()).toEqual(["flashcard", "mcq"]);
  });

  it("keeps the key notions when card generation fails, so a retry does not pay for the extraction again", async () => {
    const { deps, keyNotionRepo, extractor } = setup();
    deps.generator = fakeKeyNotionCardGenerator(() => Promise.resolve(err({ kind: "model-error", message: "boom" })));

    const result = await handleCourseGenerationJob(deps, { documentId: "doc-1" }, ctx);

    expect(result).toMatchObject({ ok: false, error: "boom" });
    expect(keyNotionRepo.keyNotions).toHaveLength(3);
    expect(keyNotionRepo.cards).toEqual([]);

    deps.generator = fakeKeyNotionCardGenerator();
    await handleCourseGenerationJob(deps, { documentId: "doc-1" }, { ...ctx, attempt: 2 });
    expect(extractor.calls).toHaveLength(1);
    expect(keyNotionRepo.cards).toHaveLength(5);
  });

  it("fails, retryable, without writing anything when the extraction fails", async () => {
    const { deps, keyNotionRepo } = setup();
    deps.extractor = fakeKeyNotionExtractor(() => Promise.resolve(err({ kind: "model-error", message: "section manquante" })));

    const result = await handleCourseGenerationJob(deps, { documentId: "doc-1" }, ctx);

    expect(result).toEqual({ ok: false, error: "section manquante" });
    expect(keyNotionRepo.keyNotions).toEqual([]);
  });

  it("fails, retryable, without storing anything when the extraction finds no key notion", async () => {
    const { deps, keyNotionRepo } = setup({ candidates: [], sections: [] });

    const result = await handleCourseGenerationJob(deps, { documentId: "doc-1" }, ctx);

    expect(result).toEqual({ ok: false, error: "The extraction found no key notion in document doc-1" });
    expect(keyNotionRepo.keyNotions).toEqual([]);
  });

  it("fails for good when the extraction's output was truncated", async () => {
    const { deps } = setup();
    deps.extractor = fakeKeyNotionExtractor(() => Promise.resolve(err({ kind: "truncated", message: "cut" })));

    expect(await handleCourseGenerationJob(deps, { documentId: "doc-1" }, ctx)).toEqual({ ok: false, error: "cut", terminal: true });
  });

  it("fails for good, without a model call, when the course is too long for one call", async () => {
    const { deps, extractor } = setup({ markdown: "x".repeat(CARD_BUDGET.maxCourseChars + 1) });

    const result = await handleCourseGenerationJob(deps, { documentId: "doc-1" }, ctx);

    expect(result).toMatchObject({ ok: false, terminal: true });
    expect(extractor.calls).toHaveLength(0);
  });

  it("fails when the course has no extraction or no reading notions", async () => {
    const { deps } = setup();
    deps.documentRepo = fakeDocumentRepositoryForGeneration(null);
    expect((await handleCourseGenerationJob(deps, { documentId: "doc-1" }, ctx)).ok).toBe(false);

    const other = setup();
    expect((await handleCourseGenerationJob(other.deps, { documentId: "doc-unknown" }, ctx)).ok).toBe(false);
  });

  // CLAUDE.md rule 6: courses over 5 pages are validated without the real
  // model. The overshoot fixture asks for twice the maximum, all essential
  // and synthesis: the hard caps alone must bring each type back in bounds.
  describe("long courses, without the model: the caps hold against an overshooting extraction", () => {
    it.each([
      [25, { flashcard: 60, mcq: 30, open: 12 }],
      [60, { flashcard: 90, mcq: 45, open: 15 }],
      [200, { flashcard: 90, mcq: 45, open: 15 }],
    ])("%i pages: cards capped at %o, never over 150", async (pages, expected) => {
      const { deps, keyNotionRepo } = setup({ markdown: "x".repeat(pages * CARD_BUDGET.charsPerPage) });
      deps.extractor = fakeKeyNotionExtractor((input) => new FixtureKeyNotionExtractor("overshoot").extract(input));

      expect(await handleCourseGenerationJob(deps, { documentId: "doc-1" }, ctx)).toEqual({ ok: true, value: undefined });

      const count = (type: string) => keyNotionRepo.cards.filter((c) => c.type === type).length;
      expect({ flashcard: count("flashcard"), mcq: count("mcq"), open: count("open") }).toEqual(expected);
      expect(keyNotionRepo.cards.length).toBeLessThanOrEqual(CARD_BUDGET.totalCardCap);
      // Every one of the overshoot's three sections keeps a key notion.
      expect(new Set(keyNotionRepo.keyNotions.map((k) => k.section))).toEqual(new Set(["Partie 1", "Partie 2", "Partie 3"]));
    });
  });
});

