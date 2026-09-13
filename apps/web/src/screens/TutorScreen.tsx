import type { DocumentSummary, ExtractionStatus } from "@studia/contracts";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import { Confused } from "../components/mascot/Confused.js";
import { Idle } from "../components/mascot/Idle.js";
import { Reading } from "../components/mascot/Reading.js";
import { Thinking } from "../components/mascot/Thinking.js";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { getDocument, listDocuments } from "../lib/documents-api.js";
import { ICON_SIZE_INLINE, ICON_STROKE_WIDTH } from "../lib/icons.js";
import { listNotions } from "../lib/notions-api.js";
import { askStream, createConversation, getConversation, type Citation, type TutorMessage } from "../lib/tutor-api.js";
import { getCachedConversationId, setCachedConversationId } from "../lib/tutor-storage.js";

function isActive(status: ExtractionStatus): boolean {
  return status === "pending" || status === "running";
}

// Shared by the answer bubble and its citations (docs/UI.md's Tuteur note),
// not Lecteur's or NotionsScreen's own components tables: headings and
// paragraphs render but stay the size of the surrounding bubble, never a
// Lecteur-sized block heading inside a small citation. Links and images are
// neutralised -- rendered as their own text/alt text, never a real <a href>
// or <img> -- because this is the first place in the app rendering markdown
// a model produced, from a prompt that necessarily includes text a student
// uploaded, not markdown ingestion extracted directly from that document:
// nothing stops that uploaded text from trying to steer the model into
// echoing back a link or image pointing at an arbitrary URL. Applied to
// citations too, even though their own source is the same trusted extracted
// markdown Lecteur already renders unrestricted, for one table instead of
// two that would differ only for a case that has not happened yet.
const TUTOR_MARKDOWN_COMPONENTS: Components = {
  p: (props) => <p className="mt-2 text-sm first:mt-0" {...props} />,
  h1: (props) => <span className="mt-2 block font-semibold first:mt-0" {...props} />,
  h2: (props) => <span className="mt-2 block font-semibold first:mt-0" {...props} />,
  h3: (props) => <span className="mt-2 block font-semibold first:mt-0" {...props} />,
  h4: (props) => <span className="mt-2 block font-semibold first:mt-0" {...props} />,
  h5: (props) => <span className="mt-2 block font-semibold first:mt-0" {...props} />,
  h6: (props) => <span className="mt-2 block font-semibold first:mt-0" {...props} />,
  ul: (props) => <ul className="mt-1 list-disc pl-5 text-sm" {...props} />,
  ol: (props) => <ol className="mt-1 list-decimal pl-5 text-sm" {...props} />,
  li: (props) => <li {...props} />,
  strong: (props) => <strong className="font-semibold" {...props} />,
  em: (props) => <em {...props} />,
  code: (props) => <code className="rounded bg-canvas px-1 text-sm" {...props} />,
  // Neither ever a real element: a link keeps only its own visible text, an
  // image only its alt text -- no href, no src, nothing this app would ever
  // navigate to or fetch on the model's or the course's say-so.
  a: ({ children }) => <>{children}</>,
  img: ({ alt }) => <>{alt}</>,
};

// Same idiom as NotionsScreen's/ReaderScreen's own CoursePill (docs/UI.md's
// Notions/Lecteur notes), kept local rather than shared — small enough that
// importing it across screens would cost more than it saves.
function CoursePill({ document, active, onSelect }: { document: DocumentSummary; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onSelect}
      className={`flex min-h-11 items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition-colors md:min-h-0 ${
        active ? "border-transparent bg-primary text-white" : "border-border bg-surface text-text hover:bg-canvas"
      }`}
    >
      <BookOpen aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} color={active ? "#fff" : document.colour} />
      {document.title}
    </button>
  );
}

// Deliberately destination-agnostic (same idiom as ReaderScreen's/
// ProgressScreen's own plain "Retour"): this screen is reachable from the
// nav directly or from NotionsScreen's "Discuter du cours", and onBack
// (App.tsx) returns to whichever one it was.
function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <Button type="button" variant="link" className="self-start" onClick={onBack}>
      Retour
    </Button>
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
    <div className={`flex flex-col gap-2 rounded-2xl border border-border p-4 ${isUser ? "self-end bg-primary-soft" : "self-start bg-surface"}`}>
      <Markdown components={TUTOR_MARKDOWN_COMPONENTS}>{message.content}</Markdown>
      {hasCitations && (
        <div className="border-t border-border pt-2">
          <Button type="button" variant="link" aria-expanded={expanded} onClick={() => setExpanded((prev) => !prev)}>
            {expanded ? "Masquer les sources" : `Voir les sources (${String(message.citations!.length)})`}
          </Button>
          {expanded && (
            <ul className="mt-2 flex flex-col gap-1 text-text-muted">
              {message.citations!.map((citation, index) => (
                <li key={index} className="text-sm">
                  <Markdown components={TUTOR_MARKDOWN_COMPONENTS}>{citation.text}</Markdown>
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

// A canned first line, not a real assistant message: never sent to the
// model, never part of `messages`, gone the moment a real question is
// asked. A deliberate departure from every other screen's mascot-based
// empty state (CLAUDE.md's own rule), confirmed with the user for this
// screen specifically, matching the mockup's own greeting bubble.
function GreetingBubble({ documentTitle }: { documentTitle: string }) {
  return (
    <div className="flex flex-col gap-2 self-start rounded-2xl border border-border bg-surface p-4" data-testid="tutor-greeting">
      <p className="text-sm">
        Salut ! Je suis ton tuteur pour « {documentTitle} ». Pose-moi n'importe quelle question à partir de tes notes : je citerai toujours le passage exact. Par quoi veut-on commencer ?
      </p>
    </div>
  );
}

// Templates cycle across a course's own first few notions (real titles, not
// invented subject knowledge) — a bit of the mockup's own phrasing variety
// ("What is X?" / "Explain X vs Y" / "Quiz me on X") without pretending to
// know anything about the course beyond notion titles this app already has.
const SUGGESTED_CHIP_TEMPLATES = [(title: string) => `Explique « ${title} »`, (title: string) => `Fais-moi un quiz sur « ${title} »`, (title: string) => `Qu'est-ce que « ${title} » ?`];
const SUGGESTED_CHIP_COUNT = 3;

function SuggestedChips({ documentId, onPick }: { documentId: string; onPick: (question: string) => void }) {
  const notionsQuery = useQuery({ queryKey: ["notions", documentId], queryFn: () => listNotions(documentId) });
  const notions = notionsQuery.data ?? [];
  if (notions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" data-testid="tutor-suggested-chips">
      {notions.slice(0, SUGGESTED_CHIP_COUNT).map((notion, index) => {
        const question = SUGGESTED_CHIP_TEMPLATES[index % SUGGESTED_CHIP_TEMPLATES.length]!(notion.title);
        return (
          <Button key={notion.id} type="button" variant="secondary" className="rounded-full text-xs" onClick={() => onPick(question)}>
            {question}
          </Button>
        );
      })}
    </div>
  );
}

function TutorConversation({ documentId, documentTitle }: { documentId: string; documentTitle: string }) {
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
      <Card className="flex flex-col gap-3 rounded-2xl">
        {[0, 1].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-border" />
        ))}
      </Card>
    );
  }

  if (cachedId !== null && historyQuery.status === "error") {
    return (
      <Card className="flex flex-col items-center gap-[var(--space-section)] rounded-2xl p-8 text-center">
        <Confused />
        <p>Impossible de charger cette conversation. Vérifie ta connexion et réessaie.</p>
        <Button className="rounded-2xl" onClick={() => void historyQuery.refetch()}>
          Réessayer
        </Button>
      </Card>
    );
  }

  async function handleSend(question: string) {
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
    <Card className="flex flex-1 flex-col gap-[var(--space-block)] rounded-2xl">
      <div className="flex flex-1 flex-col gap-3">
        {isEmpty ? (
          <GreetingBubble documentTitle={documentTitle} />
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
        {streamingText !== null &&
          (streamingText === "" ? (
            <div className="flex flex-col items-center gap-2 self-start">
              <Thinking />
            </div>
          ) : (
            <MessageBubble message={{ id: "streaming", conversationId: conversationId ?? "", role: "assistant", content: streamingText, citations: null, partial: false, createdAt: "" }} />
          ))}
      </div>

      {sendError && <p className="text-sm text-text-muted">{sendError}</p>}

      {isEmpty && <SuggestedChips documentId={documentId} onPick={(question) => setComposerValue(question)} />}

      <form
        className="flex items-end gap-2 border-t border-border pt-[var(--space-block)]"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSend(composerValue.trim());
        }}
      >
        <input
          type="text"
          className="min-h-11 flex-1 rounded-full border border-border bg-surface px-4 py-2 text-sm"
          value={composerValue}
          onChange={(event) => setComposerValue(event.target.value)}
          placeholder={`Pose ta question sur ${documentTitle}…`}
        />
        <Button type="submit" className="rounded-full" disabled={sending || composerValue.trim() === ""}>
          <Send aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
          Envoyer
        </Button>
      </form>
    </Card>
  );
}

// One course's own chat — kept as its own component (not inlined into
// TutorScreen below) so switching the pill selection can key-remount it,
// resetting per-course conversation state instead of leaking it from the
// previously-selected course (same reasoning as NotionsScreen's own
// NotionsCourseScreen/ReaderScreen's own ReaderCourseContent split).
function TutorCourseContent({ documentId }: { documentId: string }) {
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
      <div className="flex w-full flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-4 animate-pulse rounded-[var(--radius-button)] bg-border" />
        ))}
      </div>
    );
  }

  if (query.status === "error") {
    return (
      <div className="flex flex-col items-center gap-[var(--space-section)] p-8 text-center">
        <Confused />
        <p>Impossible de charger ce cours. Vérifie ta connexion et réessaie.</p>
        <Button className="rounded-2xl" onClick={() => void query.refetch()}>
          Réessayer
        </Button>
      </div>
    );
  }

  const document = query.data;

  // Same one fact, worded identically to Lecteur's own three non-ready
  // states (docs/UI.md's Tuteur note): gates the composer before a
  // question can even be sent, rather than surfacing a 409 after the fact.
  if (isActive(document.status)) {
    return (
      <div className="flex flex-col items-center gap-[var(--space-section)] p-8 text-center">
        <Reading />
        <p>Ce cours est encore en cours de lecture. Reviens dans un instant.</p>
      </div>
    );
  }

  if (document.status === "failed") {
    return (
      <div className="flex flex-col items-center gap-[var(--space-section)] p-8 text-center">
        <Confused />
        <p>La lecture de ce cours a échoué. Mets-la à jour depuis Mes cours.</p>
      </div>
    );
  }

  const markdown = document.markdown?.trim() ?? "";
  if (markdown === "") {
    return (
      <div className="flex flex-col items-center gap-[var(--space-section)] p-8 text-center">
        <Idle />
        <p>Ce cours ne contient pas encore de texte lisible.</p>
      </div>
    );
  }

  return <TutorConversation documentId={documentId} documentTitle={document.title} />;
}

// Redesigned per a "Tuteur" mockup, ignoring docs/UI.md per the user: one
// unified page (a course-picker row of pills, then that course's own chat),
// the same unification Notions/Lecteur already went through, not a separate
// picker page you leave to reach a course's conversation. documentId (still
// optional, from App.tsx's own View) keeps every existing deep link working
// (NotionsScreen's own "Discuter du cours") — when set, that course is
// pre-selected and "Retour" appears; when absent (the nav's own direct
// entry), no back link at all, matching Notions'/Lecteur's own top-level
// entry, and the first course is selected by default. Switching pills is a
// local selection, not a view transition — onSelectDocument is gone, there
// is no separate picker view left to transition into.
export function TutorScreen({ documentId, onBack }: { documentId?: string; onBack: () => void }) {
  const documentsQuery = useQuery({ queryKey: ["documents"], queryFn: listDocuments });
  const [manualSelection, setManualSelection] = useState<string | undefined>(undefined);

  if (documentsQuery.status === "pending") {
    return (
      <main className="p-4 md:p-8">
        <h1 className="mb-[var(--space-section)] font-[family-name:var(--font-display)] text-2xl font-extrabold">Tuteur</h1>
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-[var(--radius-card)] bg-border" />
          ))}
        </div>
      </main>
    );
  }

  if (documentsQuery.status === "error") {
    return (
      <main className="flex flex-col items-center gap-[var(--space-section)] p-4 md:p-8 text-center">
        <Confused />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Tuteur</h1>
        <p>Impossible de charger tes cours. Vérifie ta connexion et réessaie.</p>
        <Button className="rounded-2xl" onClick={() => void documentsQuery.refetch()}>
          Réessayer
        </Button>
      </main>
    );
  }

  const documents = documentsQuery.data;

  if (documents.length === 0) {
    return (
      <main className="flex flex-col items-center gap-4 p-4 md:p-8 text-center">
        <Idle />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Tuteur</h1>
        <p>Ajoute un cours dans Mes cours pour pouvoir en discuter avec le tuteur.</p>
      </main>
    );
  }

  const selectedId = documentId ?? manualSelection ?? documents[0]!.id;
  const selectedDocument = documents.find((d) => d.id === selectedId) ?? documents[0]!;

  return (
    <main className="flex flex-col p-4 md:p-8">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Tuteur</h1>
      <p className="mb-[var(--space-section)] text-sm text-text-muted">Une discussion ciblée sur un cours. Les réponses s'appuient sur ton cours, sources à l'appui.</p>

      <div className="mb-[var(--space-section)] flex flex-wrap gap-2">
        {documents.map((document) => (
          <CoursePill key={document.id} document={document} active={document.id === selectedDocument.id} onSelect={() => setManualSelection(document.id)} />
        ))}
      </div>

      {documentId !== undefined && (
        <div className="mb-[var(--space-related)]">
          <BackButton onBack={onBack} />
        </div>
      )}

      <TutorCourseContent key={selectedDocument.id} documentId={selectedDocument.id} />
    </main>
  );
}
