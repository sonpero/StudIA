const MIN_CARDS = 1;
const MAX_CARDS = 5;

// 1 to 5 cards per notion (docs/modules/generation.md).
export function isValidCardCount(count: number): boolean {
  return count >= MIN_CARDS && count <= MAX_CARDS;
}
