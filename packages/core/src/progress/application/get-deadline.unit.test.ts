import { describe, expect, it } from "vitest";
import { getDeadline } from "./get-deadline.js";
import { fakeProgressRepository } from "./fakes.js";

describe("getDeadline", () => {
  it("returns the deadline set for a document", async () => {
    const deadline = { id: "d1", documentId: "doc1", userId: "u1", date: "2026-03-20", label: "Contrôle", createdAt: "2026-01-01T00:00:00.000Z" };
    const repo = fakeProgressRepository({ deadlines: [deadline] });
    expect(await getDeadline({ repo }, "u1", "doc1")).toEqual(deadline);
  });

  it("returns null when none is set, fills the M5-as-shipped debt of a write-only deadline", async () => {
    const repo = fakeProgressRepository();
    expect(await getDeadline({ repo }, "u1", "doc1")).toBeNull();
  });
});
