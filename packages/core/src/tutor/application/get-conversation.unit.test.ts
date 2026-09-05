import { describe, expect, it } from "vitest";
import type { Conversation, Message } from "../domain/types.js";
import { fakeConversationRepository } from "./fakes.js";
import { getConversation } from "./get-conversation.js";

const now = new Date("2026-01-01T00:00:00.000Z");

function aConversation(overrides: Partial<Conversation> = {}): Conversation {
  return { id: "c1", userId: "u1", documentId: "doc-1", title: "Titre", createdAt: now.toISOString(), ...overrides };
}

function aMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "m1",
    conversationId: "c1",
    role: "user",
    content: "Question",
    citations: null,
    partial: false,
    createdAt: now.toISOString(),
    ...overrides,
  };
}

describe("getConversation", () => {
  it("returns the conversation and its message history for the owner", async () => {
    const conversationRepo = fakeConversationRepository({ conversations: [aConversation()], messages: [aMessage()] });

    const detail = await getConversation({ conversationRepo }, "u1", "c1");

    expect(detail).toEqual({ conversation: aConversation(), messages: [aMessage()] });
  });

  it("returns null for a conversation owned by someone else", async () => {
    const conversationRepo = fakeConversationRepository({ conversations: [aConversation({ userId: "u2" })] });

    const detail = await getConversation({ conversationRepo }, "u1", "c1");

    expect(detail).toBeNull();
  });
});
