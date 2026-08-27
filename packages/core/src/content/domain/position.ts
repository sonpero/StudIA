// Positions are contiguous from 0 with no gaps (docs/modules/content.md).
// Serves creation (from the splitter's output order), delete (call with the
// survivors in their existing relative order) and reorder (call with the
// user's full proposed order, once validate-reorder.ts has accepted it).
export function renumberContiguously(idsInOrder: string[]): { id: string; position: number }[] {
  return idsInOrder.map((id, position) => ({ id, position }));
}
