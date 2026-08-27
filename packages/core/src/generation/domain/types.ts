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
