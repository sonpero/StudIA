import { err, ok, type Result } from "../../shared/index.js";
import type { CardRepository } from "../../generation/index.js";
import { gradeMcq } from "../domain/grade-mcq.js";
import type { AnswerGrader, GradeError } from "../domain/ports.js";
import type { Rating } from "../domain/types.js";

export interface GradeAnswerDeps {
  cardRepo: CardRepository;
  grader: AnswerGrader;
}

export type GradeResult = { correct: boolean; feedback: string; suggestedRating: Rating };

// The server is the single source of truth for the rating that ends up in
// FSRS — never the client (a rating computed and self-reported in the
// browser is trivially forgeable, and would silently diverge from the
// server's own record of the card's answer). Calls out outside any
// transaction (docs/modules/review.md): grading never writes anything
// itself, submitReview is a separate call the client makes afterward with
// whatever rating it settles on.
//
// mcq is graded here via domain/grade-mcq.ts's exact-match, never through
// the LLM port (docs/modules/review.md: "graded... never by a model").
// open goes through the AnswerGrader port, and its suggestedRating is a
// suggestion the user can override before calling submitReview. flashcard
// is self-rated and never reaches this use case at all.
export async function gradeAnswer(
  deps: GradeAnswerDeps,
  userId: string,
  cardId: string,
  given: string,
): Promise<Result<GradeResult, "not-found" | "wrong-type" | GradeError>> {
  const card = await deps.cardRepo.findCard(userId, cardId);
  if (!card) return err("not-found");

  if (card.type === "mcq") {
    const { correct, suggestedRating } = gradeMcq(card.answer, given);
    const feedback = correct ? "Correct." : `Incorrect. La bonne réponse était : ${card.answer}`;
    return ok({ correct, feedback, suggestedRating });
  }

  if (card.type === "open") {
    return deps.grader.grade({ question: card.question, expected: card.answer, given });
  }

  return err("wrong-type");
}
