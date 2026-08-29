// In-memory test double for progress's own port (CLAUDE.md rule 3).
import type { Deadline, ProgressRepository } from "../domain/ports.js";

export function fakeProgressRepository(seed: { deadlines?: Deadline[] } = {}): ProgressRepository & { deadlines: Deadline[] } {
  const deadlines = [...(seed.deadlines ?? [])];

  return {
    deadlines,
    getDeadline: (userId, documentId) => Promise.resolve(deadlines.find((d) => d.userId === userId && d.documentId === documentId) ?? null),
    setDeadline: (userId, deadline) => {
      const index = deadlines.findIndex((d) => d.userId === userId && d.documentId === deadline.documentId);
      if (index === -1) deadlines.push(deadline);
      else deadlines[index] = { ...deadline, id: deadlines[index]!.id };
      return Promise.resolve();
    },
    deleteDeadline: (userId, documentId) => {
      const index = deadlines.findIndex((d) => d.userId === userId && d.documentId === documentId);
      if (index !== -1) deadlines.splice(index, 1);
      return Promise.resolve();
    },
  };
}
