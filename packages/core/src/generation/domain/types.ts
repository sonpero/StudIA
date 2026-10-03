export type CardType = "flashcard" | "mcq" | "open";
export type CardState = "active" | "stale"; // stale: its notion changed since generation

export type Card = {
  id: string;
  notionId: string;
  userId: string;
  type: CardType;
  state: CardState;
  question: string;
  answer: string; // for mcq, the text of the correct option
  options: string[] | null; // mcq only, 4 entries including the answer
  createdAt: string;
};

// The port's raw output shape, before id/notionId/userId/state/createdAt are
// attached at the persistence boundary (docs/modules/generation.md).
export type GeneratedCard = { type: CardType; question: string; answer: string; options: string[] | null };

// A key notion (M11, docs/reports/notions-cles-conception.md): a layer
// above the reading notions that drives card generation. It covers one or
// more reading notions; readingNotionIds is in course order, so the first
// one is the card's notionId.
export type KeyNotionImportance = "essential" | "important";

export type KeyNotion = {
  id: string;
  documentId: string;
  userId: string;
  title: string;
  summary: string;
  importance: KeyNotionImportance;
  isSynthesis: boolean;
  section: string;
  position: number;
  readingNotionIds: string[];
  createdAt: string;
};

export type KeyNotionCardLink = { cardId: string; keyNotionId: string };
