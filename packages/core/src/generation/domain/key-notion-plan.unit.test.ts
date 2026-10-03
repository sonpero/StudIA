import { describe, expect, it } from "vitest";
import { cardBudget, CARD_BUDGET } from "./card-budget.js";
import {
  capGeneratedCards,
  capKeyNotions,
  cardTargets,
  dedupeKeyNotions,
  normalizeKeyNotionTitle,
  uncoveredSections,
  type KeyNotionCandidate,
  type PlannedCard,
} from "./key-notion-plan.js";

function aCandidate(overrides: Partial<KeyNotionCandidate> = {}): KeyNotionCandidate {
  return {
    title: "Notion",
    summary: "Résumé.",
    importance: "important",
    isSynthesis: false,
    sectionIndex: 0,
    readingNotionIds: ["n1"],
    ...overrides,
  };
}

function aCard(overrides: Partial<PlannedCard> = {}): PlannedCard {
  return { keyNotionIndex: 0, type: "flashcard", question: "Q ?", answer: "R", options: null, ...overrides };
}

describe("normalizeKeyNotionTitle", () => {
  it("ignores case, accents, punctuation, spacing and a leading article", () => {
    expect(normalizeKeyNotionTitle("  La Découverte des agents ! ")).toBe(normalizeKeyNotionTitle("decouverte des agents"));
    expect(normalizeKeyNotionTitle("L'Agent Card")).toBe(normalizeKeyNotionTitle("agent card"));
  });

  it("keeps two genuinely different titles apart", () => {
    expect(normalizeKeyNotionTitle("Agent Card")).not.toBe(normalizeKeyNotionTitle("Agent Card étendue"));
  });
});

describe("dedupeKeyNotions", () => {
  it("merges key notions with the same normalized title into the first, uniting their reading notions in order", () => {
    const merged = dedupeKeyNotions([
      aCandidate({ title: "Agent Card", readingNotionIds: ["n1", "n2"], sectionIndex: 1 }),
      aCandidate({ title: "Autre", readingNotionIds: ["n5"] }),
      aCandidate({ title: "l'agent card", readingNotionIds: ["n2", "n3"], importance: "essential", isSynthesis: true, sectionIndex: 2 }),
    ]);

    expect(merged).toEqual([
      aCandidate({ title: "Agent Card", readingNotionIds: ["n1", "n2", "n3"], importance: "essential", isSynthesis: true, sectionIndex: 1 }),
      aCandidate({ title: "Autre", readingNotionIds: ["n5"] }),
    ]);
  });

  it("leaves a list without duplicates unchanged", () => {
    const list = [aCandidate({ title: "A" }), aCandidate({ title: "B" })];
    expect(dedupeKeyNotions(list)).toEqual(list);
  });
});

describe("capKeyNotions", () => {
  it("returns the list unchanged when it fits", () => {
    const list = [aCandidate({ title: "A" }), aCandidate({ title: "B" })];
    expect(capKeyNotions(list, 2)).toEqual(list);
  });

  it("keeps essentials before importants, in course order", () => {
    const list = [
      aCandidate({ title: "I1" }),
      aCandidate({ title: "E1", importance: "essential" }),
      aCandidate({ title: "I2" }),
      aCandidate({ title: "E2", importance: "essential" }),
    ];
    expect(capKeyNotions(list, 3).map((k) => k.title)).toEqual(["I1", "E1", "E2"]);
  });

  it("keeps at least one key notion per section, even an important one against an essential", () => {
    const list = [
      aCandidate({ title: "E1", importance: "essential", sectionIndex: 0 }),
      aCandidate({ title: "E2", importance: "essential", sectionIndex: 0 }),
      aCandidate({ title: "E3", importance: "essential", sectionIndex: 0 }),
      aCandidate({ title: "I-last-section", sectionIndex: 1 }),
    ];
    const capped = capKeyNotions(list, 2);
    expect(capped.map((k) => k.title)).toEqual(["E1", "I-last-section"]);
  });
});

describe("uncoveredSections", () => {
  it("lists every section index with no key notion", () => {
    expect(uncoveredSections(4, [aCandidate({ sectionIndex: 0 }), aCandidate({ sectionIndex: 2 }), aCandidate({ sectionIndex: 2 })])).toEqual([1, 3]);
    expect(uncoveredSections(2, [aCandidate({ sectionIndex: 0 }), aCandidate({ sectionIndex: 1 })])).toEqual([]);
  });
});

describe("cardTargets", () => {
  it("one flashcard per key notion, one MCQ per essential, one open question per synthesis key notion", () => {
    const keyNotions = [
      aCandidate({ importance: "essential", isSynthesis: true }),
      aCandidate({ importance: "important" }),
      aCandidate({ importance: "essential" }),
      aCandidate({ importance: "important", isSynthesis: true }),
    ];
    expect(cardTargets(keyNotions, cardBudget(0))).toEqual({ flashcard: [0, 1, 2, 3], mcq: [0, 2], open: [0, 3] });
  });

  it("caps each type at its budget maximum, keeping the earliest key notions", () => {
    const keyNotions = Array.from({ length: 12 }, () => aCandidate({ importance: "essential", isSynthesis: true }));
    const budget = cardBudget(0); // keyNotions max 10, mcq max 4, open max 2
    const targets = cardTargets(keyNotions, budget);
    expect(targets.flashcard).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(targets.mcq).toEqual([0, 1, 2, 3]);
    expect(targets.open).toEqual([0, 1]);
  });
});

describe("capGeneratedCards", () => {
  const targets = { flashcard: [0, 1], mcq: [0], open: [] };

  it("keeps one card per key notion and type: the first one", () => {
    const kept = capGeneratedCards(
      [aCard({ question: "Première ?" }), aCard({ question: "Doublon ?" }), aCard({ keyNotionIndex: 1, question: "Autre ?" })],
      targets,
    );
    expect(kept.map((c) => c.question)).toEqual(["Première ?", "Autre ?"]);
  });

  it("drops a card for a key notion its type does not target", () => {
    const kept = capGeneratedCards(
      [aCard({ type: "mcq", keyNotionIndex: 1, options: ["R", "a", "b", "c"] }), aCard({ type: "open", keyNotionIndex: 0 }), aCard({ keyNotionIndex: 7 })],
      targets,
    );
    expect(kept).toEqual([]);
  });

  it("never returns more than the total card cap", () => {
    const many = Array.from({ length: 200 }, (_, i) => i);
    const cards = many.map((i) => aCard({ keyNotionIndex: i, question: `Q${String(i)} ?` }));
    expect(capGeneratedCards(cards, { flashcard: many, mcq: [], open: [] })).toHaveLength(CARD_BUDGET.totalCardCap);
  });
});
