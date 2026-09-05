export type Section = { index: number; text: string };
// Ephemeral: computed fresh from the document's markdown on every `ask` call
// by splitIntoSections, never persisted, never given a stable cross-request
// id (docs/modules/tutor.md).

export type Citation = { text: string };
// A snippet captured verbatim from a Section.text at generation time, then
// persisted with the message. Never a live pointer to a section index.

export type Answer = {
  text: string;
  citations: Citation[];
  grounded: boolean; // true iff citations is non-empty
};

export type Conversation = {
  id: string;
  userId: string;
  documentId: string;
  title: string;
  createdAt: string;
};

export type Message = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[] | null;
  createdAt: string;
};
