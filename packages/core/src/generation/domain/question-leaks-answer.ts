// Questions do not leak the answer: reject a question containing the answer
// string verbatim (docs/modules/generation.md).
export function questionLeaksAnswer(question: string, answer: string): boolean {
  return question.toLowerCase().includes(answer.toLowerCase());
}
