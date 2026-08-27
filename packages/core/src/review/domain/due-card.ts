import type { CardState, CardType } from "../../generation/index.js";
import type { CardSchedule } from "./types.js";

// One card ready to show in a session: generation's card content plus its
// current schedule, or null if it has never been reviewed (docs/modules/
// review.md: "due first, then new").
export type DueCard = {
  cardId: string;
  notionId: string;
  type: CardType;
  state: CardState;
  question: string;
  answer: string;
  options: string[] | null;
  schedule: CardSchedule | null;
};
