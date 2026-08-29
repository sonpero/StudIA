import { describe, expect, it } from "vitest";
import { deleteDeadline } from "./delete-deadline.js";
import { fakePlanningRepository } from "./fakes.js";
import { setDeadline } from "./set-deadline.js";

const NOW = new Date("2026-03-02T09:00:00.000Z");

describe("setDeadline", () => {
  it("creates a deadline for a document, using now as createdAt", async () => {
    const repo = fakePlanningRepository();
    await setDeadline({ repo, idGenerator: { next: () => "deadline-1" } }, "u1", "doc1", "2026-03-20", NOW, "Contrôle de maths");

    expect(repo.deadlines).toEqual([
      { id: "deadline-1", documentId: "doc1", userId: "u1", date: "2026-03-20", label: "Contrôle de maths", createdAt: NOW.toISOString() },
    ]);
  });

  it("updates an existing deadline for the same document in place, keeping its id and its original createdAt", async () => {
    const repo = fakePlanningRepository({
      deadlines: [{ id: "existing", documentId: "doc1", userId: "u1", date: "2026-03-10", label: null, createdAt: "2026-02-01T00:00:00.000Z" }],
    });
    await setDeadline({ repo, idGenerator: { next: () => "should-not-be-used" } }, "u1", "doc1", "2026-03-20", NOW);

    // createdAt anchors the progress module's target trajectory (see
    // docs/modules/progress.md): moving the date must not restart it.
    expect(repo.deadlines).toEqual([{ id: "existing", documentId: "doc1", userId: "u1", date: "2026-03-20", label: null, createdAt: "2026-02-01T00:00:00.000Z" }]);
  });

  it("gets a fresh createdAt after the deadline is deleted and set again", async () => {
    const repo = fakePlanningRepository({
      deadlines: [{ id: "existing", documentId: "doc1", userId: "u1", date: "2026-03-10", label: null, createdAt: "2026-02-01T00:00:00.000Z" }],
    });
    await deleteDeadline({ repo }, "u1", "doc1");
    await setDeadline({ repo, idGenerator: { next: () => "deadline-2" } }, "u1", "doc1", "2026-03-20", NOW);

    expect(repo.deadlines).toEqual([{ id: "deadline-2", documentId: "doc1", userId: "u1", date: "2026-03-20", label: null, createdAt: NOW.toISOString() }]);
  });

  it("defaults label to null when omitted", async () => {
    const repo = fakePlanningRepository();
    await setDeadline({ repo, idGenerator: { next: () => "deadline-1" } }, "u1", "doc1", "2026-03-20", NOW);
    expect(repo.deadlines[0]?.label).toBeNull();
  });
});
