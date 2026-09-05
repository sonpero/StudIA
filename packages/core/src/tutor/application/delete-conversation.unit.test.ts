import { describe, expect, it } from "vitest";
import type { Conversation } from "../domain/types.js";
import { deleteConversation } from "./delete-conversation.js";
import { fakeConversationRepository } from "./fakes.js";

const now = new Date("2026-01-01T00:00:00.000Z");

function aConversation(overrides: Partial<Conversation> = {}): Conversation {
  return { id: "c1", userId: "u1", documentId: "doc-1", title: "Titre", createdAt: now.toISOString(), ...overrides };
}

describe("deleteConversation", () => {
  it("removes the caller's conversation", async () => {
    const conversationRepo = fakeConversationRepository({ conversations: [aConversation()] });

    const result = await deleteConversation({ conversationRepo }, "u1", "c1");

    expect(result).toEqual({ ok: true, value: undefined });
    expect(conversationRepo.conversations).toHaveLength(0);
  });

  it("fails with not-found for another user's conversation, without removing it", async () => {
    const conversationRepo = fakeConversationRepository({ conversations: [aConversation({ userId: "u2" })] });

    const result = await deleteConversation({ conversationRepo }, "u1", "c1");

    expect(result).toEqual({ ok: false, error: "not-found" });
    expect(conversationRepo.conversations).toHaveLength(1);
  });
});
