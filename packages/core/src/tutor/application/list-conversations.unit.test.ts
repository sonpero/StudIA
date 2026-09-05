import { describe, expect, it } from "vitest";
import type { Conversation } from "../domain/types.js";
import { fakeConversationRepository } from "./fakes.js";
import { listConversations } from "./list-conversations.js";

const now = new Date("2026-01-01T00:00:00.000Z");

function aConversation(overrides: Partial<Conversation> = {}): Conversation {
  return { id: "c1", userId: "u1", documentId: "doc-1", title: "Titre", createdAt: now.toISOString(), ...overrides };
}

describe("listConversations", () => {
  it("lists only the caller's conversations for that document", async () => {
    const conversationRepo = fakeConversationRepository({
      conversations: [
        aConversation({ id: "c1" }),
        aConversation({ id: "c2", documentId: "doc-2" }),
        aConversation({ id: "c3", userId: "u2" }),
      ],
    });

    const conversations = await listConversations({ conversationRepo }, "u1", "doc-1");

    expect(conversations.map((c) => c.id)).toEqual(["c1"]);
  });
});
