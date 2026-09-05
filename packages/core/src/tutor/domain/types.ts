export type Section = { index: number; text: string };
// Ephemeral: computed fresh from the document's markdown on every `ask` call
// by splitIntoSections, never persisted, never given a stable cross-request
// id (docs/modules/tutor.md).

export type Citation = { text: string };
// A snippet captured verbatim from a Section.text at generation time, then
// persisted with the message. Never a live pointer to a section index.

// A discriminated union, not a `partial: boolean` flag next to the same
// fields: reading `.citations` or `.grounded` without first narrowing on
// `.kind` does not compile, so a truncated answer cannot be treated as a
// success by omission (docs/modules/tutor.md). No citations on the partial
// branch: extracting citations from a truncated answer cannot be done
// honestly.
export type Answer =
  | { kind: "complete"; text: string; citations: Citation[]; grounded: boolean }
  | { kind: "partial"; text: string };

export type Conversation = {
  id: string;
  userId: string;
  documentId: string;
  title: string | null; // null until the conversation's first message is asked
  createdAt: string;
};

export type Message = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[] | null;
  partial: boolean; // true iff the stream that produced this message was cut short
  createdAt: string;
};
