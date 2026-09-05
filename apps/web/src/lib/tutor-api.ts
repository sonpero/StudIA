import { apiFetch } from "./api-client.js";

// Hand-written, not from @studia/contracts: tutor's route schemas live
// inline in apps/api/src/routes/tutor.ts, the same choice pomodoro made
// (apps/web/src/lib/pomodoro-api.ts is the precedent) -- nothing in
// packages/contracts for this module.
export type Citation = { text: string };

export type TutorMessage = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[] | null;
  partial: boolean;
  createdAt: string;
};

export type TutorConversation = {
  id: string;
  userId: string;
  documentId: string;
  title: string | null;
  createdAt: string;
};

export type ConversationDetail = { conversation: TutorConversation; messages: TutorMessage[] };

export async function createConversation(documentId: string): Promise<TutorConversation> {
  const res = await apiFetch(`/api/documents/${documentId}/conversations`, { method: "POST" });
  if (!res.ok) throw new Error("Impossible de démarrer une conversation.");
  return res.json() as Promise<TutorConversation>;
}

export async function getConversation(id: string): Promise<ConversationDetail> {
  const res = await apiFetch(`/api/conversations/${id}`);
  if (!res.ok) throw new Error("Cette conversation est introuvable.");
  return res.json() as Promise<ConversationDetail>;
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await apiFetch(`/api/conversations/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Impossible de supprimer cette conversation.");
}

// Mirrors docs/modules/tutor.md's Answer union client-side: no branch
// shared between a complete answer and a partial one. `done`'s citations
// are the actual cited text (Citation.text), never generated here.
export type TutorStreamEvent = { type: "chunk"; text: string } | { type: "done"; citations: Citation[]; grounded: boolean } | { type: "partial" };

export function parseSseEvent(block: string): TutorStreamEvent | null {
  const lines = block.split("\n");
  const eventLine = lines.find((line) => line.startsWith("event: "));
  const dataLine = lines.find((line) => line.startsWith("data: "));
  if (!eventLine || !dataLine) return null;

  const event = eventLine.slice("event: ".length);
  const data = JSON.parse(dataLine.slice("data: ".length)) as unknown;

  if (event === "chunk") return { type: "chunk", text: (data as { text: string }).text };
  if (event === "done") {
    const parsed = data as { citations: Citation[]; grounded: boolean };
    return { type: "done", citations: parsed.citations, grounded: parsed.grounded };
  }
  if (event === "partial") return { type: "partial" };
  return null;
}

// Not EventSource (GET-only, no request body): the route is a POST with a
// JSON question, so this reads and parses the raw SSE stream by hand, same
// event framing apps/api/src/routes/tutor.ts writes.
export async function* askStream(conversationId: string, question: string): AsyncGenerator<TutorStreamEvent, void, void> {
  const res = await apiFetch(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok || !res.body) throw new Error("Impossible d'envoyer la question.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex !== -1) {
      const block = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      const event = parseSseEvent(block);
      if (event) yield event;
      separatorIndex = buffer.indexOf("\n\n");
    }
  }
}
