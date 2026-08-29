import { describe, expect, it } from "vitest";
import { deleteDeadline } from "./delete-deadline.js";
import { fakeProgressRepository } from "./fakes.js";

describe("deleteDeadline", () => {
  it("removes the deadline for a document", async () => {
    const repo = fakeProgressRepository({
      deadlines: [{ id: "d1", documentId: "doc1", userId: "u1", date: "2026-03-20", label: null, createdAt: "2026-01-01T00:00:00.000Z" }],
    });
    await deleteDeadline({ repo }, "u1", "doc1");
    expect(await repo.getDeadline("u1", "doc1")).toBeNull();
  });
});
