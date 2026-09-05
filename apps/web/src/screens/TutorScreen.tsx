import type { ExtractionStatus } from "@studia/contracts";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Confused } from "../components/mascot/Confused.js";
import { Idle } from "../components/mascot/Idle.js";
import { Reading } from "../components/mascot/Reading.js";
import { Thinking } from "../components/mascot/Thinking.js";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { getDocument, listDocuments } from "../lib/documents-api.js";
import { ICON_SIZE_INLINE, ICON_STROKE_WIDTH } from "../lib/icons.js";
import { askStream, createConversation, getConversation, type Citation, type TutorMessage } from "../lib/tutor-api.js";
import { getCachedConversationId, setCachedConversationId } from "../lib/tutor-storage.js";

function isActive(status: ExtractionStatus): boolean {
  return status === "pending" || status === "running";
}

function TutorPickerScreen({ onSelectDocument }: { onSelectDocument: (documentId: string) => void }) {
  const query = useQuery({ queryKey: ["documents"], queryFn: listDocuments });

  if (query.status === "pending") {
    return (
      <main className="p-8">
        <h1 className="mb-[var(--space-section)] font-[family-name:var(--font-display)] text-2xl font-extrabold">Tuteur</h1>
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-[var(--radius-card)] bg-border" />
          ))}
        </div>
      </main>
    );
  }

  if (query.status === "error") {
    return (
      <main className="flex flex-col items-center gap-[var(--space-section)] p-8 text-center">
        <Confused />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Tuteur</h1>
        <p>Impossible de charger tes cours. Vérifie ta connexion et réessaie.</p>
        <Button onClick={() => void query.refetch()}>Réessayer</Button>
      </main>
    );
  }

  const documents = query.data;

  if (documents.length === 0) {
    return (
      <main className="flex flex-col items-center gap-4 p-8 text-center">
        <Idle />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Tuteur</h1>
        <p>Ajoute un cours dans Mes cours pour pouvoir en discuter avec le tuteur.</p>
      </main>
    );
  }

  return (
    <main className="p-8">
      <h1 className="mb-[var(--space-section)] font-[family-name:var(--font-display)] text-2xl font-extrabold">Tuteur</h1>
      <p className="mb-[var(--space-block)] text-sm text-text-muted">Choisis un cours pour commencer à discuter.</p>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-[var(--space-block)]">
        {documents.map((document) => (
          <Card key={document.id} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ backgroundColor: document.colour }} />
              <span className="font-[family-name:var(--font-display)] text-[length:var(--text-title)] font-extrabold">{document.title}</span>
            </div>
            <Button variant="secondary" onClick={() => onSelectDocument(document.id)}>
              <MessageCircle aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
              Discuter
            </Button>
          </Card>
        ))}
      </div>
    </main>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="text-sm text-text-muted underline" onClick={onBack}>
      Retour
    </button>
  );
}

function MessageBubble({ message }: { message: TutorMessage }) {
  const isUser = message.role === "user";
  // Per message, never persisted: a plain component-state boolean, local to
  // this one bubble instance (docs/UI.md's Tuteur note) -- a reload always
  // shows every citation list collapsed again, same as NotionsScreen's own
  // "Voir le contenu" already resets on reload.
  const [expanded, setExpanded] = useState(false);
  const hasCitations = !isUser && !!message.citations && message.citations.length > 0;

  return (
    <div className={`flex flex-col gap-2 rounded-[var(--radius-card)] border border-border p-4 ${isUser ? "self-end bg-primary-soft" : "self-start bg-surface"}`}>
      <p className="whitespace-pre-wrap text-sm">{message.content}</p>
      {hasCitations && (
        <div className="border-t border-border pt-2">
          <button type="button" className="text-sm text-text-muted underline" aria-expanded={expanded} onClick={() => setExpanded((prev) => !prev)}>
            {expanded ? "Masquer les sources" : `Voir les sources (${String(message.citations!.length)})`}
          </button>
          {expanded && (
            <ul className="mt-2 flex flex-col gap-1">
              {message.citations!.map((citation, index) => (
                <li key={index} className="text-sm text-text-muted">
                  {citation.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!isUser && message.partial && <p className="text-sm text-text-muted">La réponse s'est arrêtée avant la fin.</p>}
    </div>
  );
}

function TutorConversation({ documentId, onBack }: { documentId: string; onBack: () => void }) {
  // Captured once, at mount, not read again on every render: writing a
  // freshly created conversation's id to localStorage inside handleSend
  // below must not flip this on mid-conversation and re-enable
  // historyQuery for a conversation this screen already built locally.
  const [cachedId] = useState(() => getCachedConversationId(documentId));
  const [conversationId, setConversationId] = useState<string | null>(cachedId);
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [composerValue, setComposerValue] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const historyQuery = useQuery({
    queryKey: ["conversation", cachedId],
    queryFn: () => getConversation(cachedId!),
    enabled: cachedId !== null,
  });

  // Seeds local state once from the loaded history, then this screen owns
  // every further update itself (streaming, sending): historyQuery is never
  // consulted again after this, so a later question does not fight this
  // effect over who owns `messages`.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!seededRef.current && historyQuery.status === "success") {
      seededRef.current = true;
      setMessages(historyQuery.data.messages);
    }
  }, [historyQuery.status, historyQuery.data]);

  if (cachedId !== null && historyQuery.status === "pending") {
    return (
      <main className="flex flex-col gap-[var(--space-section)] p-8">
        <div className="flex items-center justify-between">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Tuteur</h1>
          <BackButton onBack={onBack} />
        </div>
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-[var(--radius-card)] bg-border" />
          ))}
        </div>
      </main>
    );
  }

  if (cachedId !== null && historyQuery.status === "error") {
    return (
      <main className="flex flex-col items-center gap-[var(--space-section)] p-8 text-center">
        <Confused />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Tuteur</h1>
        <p>Impossible de charger cette conversation. Vérifie ta connexion et réessaie.</p>
        <Button onClick={() => void historyQuery.refetch()}>Réessayer</Button>
        <BackButton onBack={onBack} />
      </main>
    );
  }

  async function handleSend() {
    const question = composerValue.trim();
    if (!question || sending) return;

    setSending(true);
    setSendError(null);
    setStreamingText("");
    setComposerValue("");
    const userMessage: TutorMessage = {
      id: `local-question-${String(Date.now())}`,
      conversationId: conversationId ?? "",
      role: "user",
      content: question,
      citations: null,
      partial: false,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      let id = conversationId;
      if (id === null) {
        const conversation = await createConversation(documentId);
        id = conversation.id;
        setConversationId(id);
        setCachedConversationId(documentId, id);
      }

      let text = "";
      let citations: Citation[] = [];
      let grounded = false;
      let partial = false;
      for await (const event of askStream(id, question)) {
        if (event.type === "chunk") {
          text += event.text;
          setStreamingText(text);
        } else if (event.type === "done") {
          citations = event.citations;
          grounded = event.grounded;
        } else if (event.type === "partial") {
          partial = true;
        }
      }

      const assistantMessage: TutorMessage = {
        id: `local-answer-${String(Date.now())}`,
        conversationId: id,
        role: "assistant",
        content: text,
        citations: partial ? null : citations,
        partial,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      // Grounded is derived, not tracked separately here: the message's own
      // citations already carry it (docs/modules/tutor.md), and rendering
      // never branches on `grounded` directly -- only on whether there is
      // something honest to list.
      void grounded;
      if (partial) setComposerValue(question);
    } catch {
      setSendError("Impossible d'envoyer la question. Réessaie.");
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
      setComposerValue(question);
    } finally {
      setSending(false);
      setStreamingText(null);
    }
  }

  const isEmpty = messages.length === 0 && streamingText === null;

  return (
    <main className="flex flex-col gap-[var(--space-section)] p-8">
      <div className="flex items-center justify-between">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Tuteur</h1>
        <BackButton onBack={onBack} />
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-[var(--space-block)]">
        {isEmpty ? (
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <Idle />
            <p>Pose ta première question sur ce cours.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {streamingText !== null &&
              (streamingText === "" ? (
                <div className="flex flex-col items-center gap-2 self-start">
                  <Thinking />
                </div>
              ) : (
                <MessageBubble message={{ id: "streaming", conversationId: conversationId ?? "", role: "assistant", content: streamingText, citations: null, partial: false, createdAt: "" }} />
              ))}
          </div>
        )}

        {sendError && <p className="text-sm text-text-muted">{sendError}</p>}

        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSend();
          }}
        >
          <textarea
            className="min-h-11 flex-1 rounded-[var(--radius-button)] border border-border bg-surface p-2 text-sm"
            value={composerValue}
            onChange={(event) => setComposerValue(event.target.value)}
            placeholder="Pose ta question…"
          />
          <Button type="submit" disabled={sending || composerValue.trim() === ""}>
            Envoyer
          </Button>
        </form>
      </div>
    </main>
  );
}

function TutorChatScreen({ documentId, onBack }: { documentId: string; onBack: () => void }) {
  const pollStartedAt = useRef<number | null>(null);

  const query = useQuery({
    queryKey: ["document", documentId],
    queryFn: () => getDocument(documentId),
    refetchInterval: (q) => {
      const document = q.state.data;
      const active = document ? isActive(document.status) : false;
      if (!active) {
        pollStartedAt.current = null;
        return false;
      }
      pollStartedAt.current ??= Date.now();
      return Date.now() - pollStartedAt.current > 30_000 ? 10_000 : 2_000;
    },
  });

  if (query.status === "pending") {
    return (
      <main className="flex flex-col gap-[var(--space-section)] p-8">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Tuteur</h1>
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-4 animate-pulse rounded-[var(--radius-button)] bg-border" />
          ))}
        </div>
      </main>
    );
  }

  if (query.status === "error") {
    return (
      <main className="flex flex-col items-center gap-[var(--space-section)] p-8 text-center">
        <Confused />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Tuteur</h1>
        <p>Impossible de charger ce cours. Vérifie ta connexion et réessaie.</p>
        <Button onClick={() => void query.refetch()}>Réessayer</Button>
        <BackButton onBack={onBack} />
      </main>
    );
  }

  const document = query.data;

  // Same one fact, worded identically to Lecteur's own three non-ready
  // states (docs/UI.md's Tuteur note): gates the composer before a
  // question can even be sent, rather than surfacing a 409 after the fact.
  if (isActive(document.status)) {
    return (
      <main className="flex flex-col items-center gap-[var(--space-section)] p-8 text-center">
        <Reading />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Tuteur</h1>
        <p>Ce cours est encore en cours de lecture. Reviens dans un instant.</p>
        <BackButton onBack={onBack} />
      </main>
    );
  }

  if (document.status === "failed") {
    return (
      <main className="flex flex-col items-center gap-[var(--space-section)] p-8 text-center">
        <Confused />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Tuteur</h1>
        <p>La lecture de ce cours a échoué. Mets-la à jour depuis Mes cours.</p>
        <BackButton onBack={onBack} />
      </main>
    );
  }

  const markdown = document.markdown?.trim() ?? "";
  if (markdown === "") {
    return (
      <main className="flex flex-col items-center gap-[var(--space-section)] p-8 text-center">
        <Idle />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Tuteur</h1>
        <p>Ce cours ne contient pas encore de texte lisible.</p>
        <BackButton onBack={onBack} />
      </main>
    );
  }

  return <TutorConversation documentId={documentId} onBack={onBack} />;
}

export function TutorScreen({
  documentId,
  onSelectDocument,
  onBack,
}: {
  documentId?: string;
  onSelectDocument: (documentId: string) => void;
  onBack: () => void;
}) {
  if (!documentId) return <TutorPickerScreen onSelectDocument={onSelectDocument} />;
  return <TutorChatScreen documentId={documentId} onBack={onBack} />;
}
