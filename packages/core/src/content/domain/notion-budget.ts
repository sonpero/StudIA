// The prompt's 600-to-1 000-character target (notion-count-target.ts) is a
// density, so nothing ties the chunks' answers to the document's cap: nine
// chunks each drifting a little finely still add up past it. Each chunk
// instead gets a share of the cap as a ceiling, in proportion to its length,
// so a model that respects every ceiling can never exceed the cap.
//
// Largest-remainder apportionment: the budgets sum to exactly `cap`, never
// more. When the cap covers every chunk, each first gets one notion (a
// ceiling of 0 would ask a chunk to drop its content), and only the rest is
// shared out. Remainder ties go to the earlier chunk, so the result is a
// pure function of its inputs.
export function notionBudgets(chunkLengths: readonly number[], cap: number): number[] {
  const count = chunkLengths.length;
  const reserved = cap >= count ? 1 : 0;
  const shared = cap - reserved * count;
  const totalLength = chunkLengths.reduce((total, length) => total + length, 0);
  const quotas = chunkLengths.map((length) => (totalLength === 0 ? shared / count : (shared * length) / totalLength));
  const budgets = quotas.map((quota) => Math.floor(quota));

  const leftover = shared - budgets.reduce((total, budget) => total + budget, 0);
  const byRemainder = quotas
    .map((quota, index) => ({ index, remainder: quota - Math.floor(quota) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of byRemainder.slice(0, leftover)) budgets[index] = (budgets[index] ?? 0) + 1;

  return budgets.map((budget) => budget + reserved);
}
