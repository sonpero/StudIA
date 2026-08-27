export type Rating = 1 | 2 | 3 | 4; // again, hard, good, easy

export type CardSchedule = {
  cardId: string;
  userId: string;
  due: string; // ISO
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  lastReviewedAt: string | null;
};

export type Review = {
  id: string;
  cardId: string;
  userId: string;
  rating: Rating;
  reviewedAt: string;
  elapsedMs: number;
};
