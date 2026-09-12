import type { DocumentSummary } from "@studia/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Layers, Repeat } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import { Confused } from "../components/mascot/Confused.js";
import { Idle } from "../components/mascot/Idle.js";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { listDocuments } from "../lib/documents-api.js";
import { todayDateKey } from "../lib/day-boundary.js";
import { ICON_SIZE_INLINE, ICON_STROKE_WIDTH } from "../lib/icons.js";
import { getToday } from "../lib/today-api.js";
import {
  generateCardsForDocument,
  getGenerationStatus,
  getNotionsProgress,
  getProgress,
  listNotions,
  type CardType,
  type NotionProgress,
} from "../lib/notions-api.js";

// Generation is much faster than extraction (a handful of small LLM calls,
// not a whole document read), so a fixed short interval is enough — no need
// for DocumentsScreen/NotionsScreen's 30s backoff.
const GENERATION_POLL_MS = 1500;

// User choice of activity type (docs/modules/generation.md's open question,
// settled in M4): flashcard checked by default, matching M3's behaviour.
const CARD_TYPE_LABEL: Record<CardType, string> = { flashcard: "Flashcards", mcq: "QCM", open: "Questions ouvertes" };
const ALL_CARD_TYPES: CardType[] = ["flashcard", "mcq", "open"];

// Splitting into notions runs automatically after extraction
// (docs/modules/content.md), asynchronously — never block the UI on a job
// (docs/UI.md). Poll while there is nothing to show yet, backing off after
// 30 seconds like DocumentsScreen's extraction poll, and give up after 2
// minutes: content has no split-status endpoint to say "still running" vs.
// "genuinely produced nothing", so an unbounded poll would never stop for a
// document whose split job actually failed.
const POLL_GIVE_UP_MS = 120_000;

// Same token classes as the reader's own markdown mapping (docs/UI.md's
// Lecteur note), but deliberately tighter: this content sits inline in a
// list of notion cards, not on a dedicated reading page, and the reader's
// generous margins would inflate every row. No heading overrides — a
// notion's body is self-contained prose (docs/modules/content.md), not
// expected to carry its own heading structure.
const NOTION_BODY_COMPONENTS: Components = {
  p: (props) => <p className="mt-1 text-sm text-text first:mt-0" {...props} />,
  ul: (props) => <ul className="mt-1 list-disc pl-5 text-sm text-text" {...props} />,
  ol: (props) => <ol className="mt-1 list-decimal pl-5 text-sm text-text" {...props} />,
  li: (props) => <li {...props} />,
  strong: (props) => <strong className="font-semibold text-text" {...props} />,
  code: (props) => <code className="rounded bg-canvas px-1 text-sm" {...props} />,
};

// Redesigned per a "Notions" mockup, ignoring docs/UI.md per the user. A
// one-line, non-markdown-aware preview: notion bodies are self-contained
// prose (docs/modules/content.md), so a plain-text cut rarely lands mid
// markup — "Voir le contenu" below still renders the real thing in full
// for the rare case it does.
function truncateBody(body: string, max = 140): string {
  const trimmed = body.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

// Same calendar-day arithmetic as ProgressScreen.tsx's own daysUntil, kept
// local rather than shared — small enough that importing it across screens
// would cost more than it saves.
function daysUntil(dateKey: string, todayKey: string): number {
  const a = new Date(`${todayKey}T00:00:00.000Z`).getTime();
  const b = new Date(`${dateKey}T00:00:00.000Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

// nextDueDate is always tomorrow or later by construction (review's own
// getNotionsProgress, "at or after dayBoundary") — never "aujourd'hui" here,
// that's what the dueNow badge already says instead.
function formatNextReview(nextDueDateIso: string, todayKey: string): string {
  const days = daysUntil(nextDueDateIso.slice(0, 10), todayKey);
  return days <= 1 ? "demain" : `dans ${days} jours`;
}

type NotionStatus = "mastered" | "due" | "learning";

// Mastery wins even over a technically-due card (docs/modules/review.md: a
// notion already past both thresholds can still have a card whose own next
// FSRS interval happens to fall soon) — matches the mockup's own example, a
// mastered notion still showing a future review date, not "due now".
function notionStatus(progress: NotionProgress | undefined): NotionStatus {
  if (!progress || progress.totalCards === 0) return "learning";
  if (progress.masteredCards === progress.totalCards) return "mastered";
  if (progress.dueNow) return "due";
  return "learning";
}

const STATUS_LABEL: Record<NotionStatus, string> = { mastered: "Maîtrisée", due: "À réviser", learning: "En apprentissage" };
const STATUS_BADGE_CLASS: Record<NotionStatus, string> = {
  mastered: "bg-success/10 text-success",
  due: "bg-warning/10 text-warning",
  learning: "bg-canvas text-text-muted",
};

// Five dots, filled up to the notion's own review count (capped) — a plain
// visual echo of "how many times has this been practiced", not a precise
// mastery gauge (ProgressScreen's own Gauge already covers that). Coloured
// with the course's own colour, the same "same colour as its course"
// treatment the due-count digit already gets on Aujourd'hui/Mes cours.
function ReviewDots({ reps, colour }: { reps: number; colour: string }) {
  const filled = Math.min(5, reps);
  return (
    <div className="flex items-center gap-1" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className="h-2 w-2 rounded-full" style={{ backgroundColor: i < filled ? colour : "var(--color-border)" }} />
      ))}
    </div>
  );
}

function CoursePill({ document, active, onSelect }: { document: DocumentSummary; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onSelect}
      className={`flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition-colors ${
        active ? "border-transparent bg-primary text-white" : "border-border bg-surface text-text hover:bg-canvas"
      }`}
    >
      <BookOpen aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} color={active ? "#fff" : document.colour} />
      {document.title}
    </button>
  );
}

function CourseSummaryCard({ document, dueCount, onReview }: { document: DocumentSummary; dueCount: number; onReview: () => void }) {
  const progressQuery = useQuery({ queryKey: ["progress", document.id], queryFn: () => getProgress(document.id) });
  const progress = progressQuery.data;

  return (
    <Card className="flex flex-wrap items-center justify-between gap-4" data-testid="notions-course-summary">
      <div className="flex items-center gap-[var(--space-related)]">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${document.colour}26` }}>
          <BookOpen aria-hidden="true" focusable="false" size={24} strokeWidth={ICON_STROKE_WIDTH} color={document.colour} />
        </span>
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-[length:var(--text-title)] font-extrabold">{document.title}</h2>
          {progress && (
            <p className="flex items-center gap-1.5 text-sm text-text-muted">
              <Layers aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
              {progress.total} notion{progress.total > 1 ? "s" : ""} · {progress.mastered} maîtrisée{progress.mastered > 1 ? "s" : ""} ·{" "}
              <strong className="font-semibold text-text">{dueCount} à réviser</strong>
            </p>
          )}
        </div>
      </div>
      {dueCount > 0 ? (
        <Button variant="accent" className="rounded-2xl" onClick={onReview}>
          Réviser {dueCount} fiche{dueCount > 1 ? "s" : ""}
          <ArrowRight aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
        </Button>
      ) : (
        <Button variant="secondary" className="rounded-2xl" disabled>
          Rien à réviser
        </Button>
      )}
    </Card>
  );
}

function NotionCard({
  notion,
  notionProgress,
  colour,
  todayKey,
  expanded,
  onToggleBody,
  onReview,
}: {
  notion: { id: string; title: string; body: string };
  notionProgress: NotionProgress | undefined;
  colour: string;
  todayKey: string;
  expanded: boolean;
  onToggleBody: () => void;
  onReview: () => void;
}) {
  const status = notionStatus(notionProgress);
  const reps = notionProgress?.reps ?? 0;

  return (
    <Card className="flex flex-col gap-[var(--space-related)]" data-testid="notion-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="font-[family-name:var(--font-display)] text-[length:var(--text-title)] font-extrabold">{notion.title}</h3>
          <span className={`rounded-full px-2 py-0.5 text-[length:var(--text-label)] font-semibold ${STATUS_BADGE_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
        </div>
        <Button variant="accent" className="rounded-2xl" onClick={onReview}>
          <Repeat aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
          Réviser
        </Button>
      </div>

      <p className="text-sm text-text-muted">{truncateBody(notion.body)}</p>

      <div className="flex items-center gap-[var(--space-related)] text-[length:var(--text-label)] text-text-muted">
        <ReviewDots reps={reps} colour={colour} />
        <span>
          {reps} révision{reps > 1 ? "s" : ""}
          {status === "due" ? " · à réviser maintenant" : notionProgress?.nextDueDate ? ` · ${formatNextReview(notionProgress.nextDueDate, todayKey)}` : ""}
        </span>
      </div>

      <Button type="button" variant="link" className="self-start text-primary" aria-expanded={expanded} onClick={onToggleBody}>
        {expanded ? "Masquer le contenu" : "Voir le contenu"}
      </Button>
      {expanded && <Markdown components={NOTION_BODY_COMPONENTS}>{notion.body}</Markdown>}
    </Card>
  );
}

// One course's own notions, progress and fiche-generation controls — kept
// as its own component (not inlined into NotionsScreen below) so switching
// the pill selection can key-remount it, resetting per-course UI state
// (which notion is expanded, the generation form) instead of leaking it
// from the previously-selected course.
function NotionsCourseScreen({
  document,
  dueCount,
  showBackLink,
  onBack,
  onReview,
  onOpenProgress,
  onOpenReader,
  onOpenTutor,
}: {
  document: DocumentSummary;
  dueCount: number;
  showBackLink: boolean;
  onBack: () => void;
  onReview: (notionId?: string) => void;
  onOpenProgress: () => void;
  onOpenReader: () => void;
  onOpenTutor: () => void;
}) {
  const documentId = document.id;
  const queryClient = useQueryClient();
  const pollStartedAt = useRef<number | null>(null);
  const [expandedNotionIds, setExpandedNotionIds] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<Set<CardType>>(new Set<CardType>(["flashcard"]));
  const todayKey = todayDateKey();

  function toggleType(type: CardType) {
    setSelectedTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function toggleBody(notionId: string) {
    setExpandedNotionIds((current) => {
      const next = new Set(current);
      if (next.has(notionId)) next.delete(notionId);
      else next.add(notionId);
      return next;
    });
  }

  const notionsQuery = useQuery({
    queryKey: ["notions", documentId],
    queryFn: () => listNotions(documentId),
    refetchInterval: (q) => {
      const notions = q.state.data;
      if (notions && notions.length > 0) {
        pollStartedAt.current = null;
        return false;
      }
      pollStartedAt.current ??= Date.now();
      const elapsed = Date.now() - pollStartedAt.current;
      if (elapsed > POLL_GIVE_UP_MS) return false;
      return elapsed > 30_000 ? 10_000 : 2_000;
    },
  });
  const notionsProgressQuery = useQuery({ queryKey: ["notions-progress", documentId], queryFn: () => getNotionsProgress(documentId) });

  const generationStatusQuery = useQuery({
    queryKey: ["generation-status", documentId],
    queryFn: () => getGenerationStatus(documentId),
    enabled: generating,
    refetchInterval: (q) => {
      const status = q.state.data;
      if (!status) return GENERATION_POLL_MS;
      return status.done + status.failed < status.total ? GENERATION_POLL_MS : false;
    },
  });
  const generationStatus = generationStatusQuery.data;
  const generationComplete = generating && generationStatus !== undefined && generationStatus.done + generationStatus.failed >= generationStatus.total;

  useEffect(() => {
    if (!generationComplete) return;
    setGenerating(false);
    void queryClient.invalidateQueries({ queryKey: ["notions", documentId] });
    void queryClient.invalidateQueries({ queryKey: ["progress", documentId] });
    void queryClient.invalidateQueries({ queryKey: ["notions-progress", documentId] });
    // Freshly generated cards are due immediately (never reviewed), which
    // moves this course's own due count — CourseSummaryCard's "Réviser N
    // fiches" button reads that count from the outer NotionsScreen's own
    // ["today"] query, so without this it can stay stuck on a pre-generation
    // count (often "Rien à réviser") until something else happens to
    // refetch it.
    void queryClient.invalidateQueries({ queryKey: ["today"] });
  }, [generationComplete, documentId, queryClient]);

  useEffect(() => {
    if (generationStatusQuery.status !== "error") return;
    setGenerating(false);
    setGenerateError(true);
  }, [generationStatusQuery.status]);

  async function handleGenerate() {
    setGenerateError(false);
    try {
      await generateCardsForDocument(documentId, Array.from(selectedTypes));
      setGenerating(true);
    } catch {
      setGenerateError(true);
    }
  }

  return (
    <div className="flex flex-col gap-[var(--space-block)]">
      {showBackLink && (
        <Button type="button" variant="link" className="self-start" onClick={onBack}>
          Retour à mes cours
        </Button>
      )}

      <CourseSummaryCard document={document} dueCount={dueCount} onReview={() => onReview()} />

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <button type="button" className="text-text-muted underline" onClick={onOpenReader}>
          Lire le cours
        </button>
        <button type="button" className="text-text-muted underline" onClick={onOpenProgress}>
          Voir tes progrès
        </button>
        <button type="button" className="text-text-muted underline" onClick={onOpenTutor}>
          Discuter du cours
        </button>
      </div>

      {notionsQuery.status === "pending" && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-[var(--radius-card)] bg-border" />
          ))}
        </div>
      )}

      {notionsQuery.status === "error" && (
        <div className="flex flex-col items-center gap-[var(--space-section)] p-8 text-center">
          <Confused />
          <p>Impossible de charger les notions de ce cours. Vérifie ta connexion et réessaie.</p>
          <Button className="rounded-2xl" onClick={() => void notionsQuery.refetch()}>
            Réessayer
          </Button>
        </div>
      )}

      {notionsQuery.status === "success" && notionsQuery.data.length === 0 && (
        <div className="flex flex-col items-center gap-[var(--space-section)] p-8 text-center">
          <Idle />
          <p>Les notions de ce cours n'ont pas encore été créées. Reviens un peu plus tard.</p>
        </div>
      )}

      {notionsQuery.status === "success" &&
        notionsQuery.data.length > 0 &&
        (() => {
          const notions = notionsQuery.data;
          const notionsProgress = notionsProgressQuery.data;
          const allNotionsHaveCards =
            notionsProgress !== undefined && notions.every((notion) => (notionsProgress.find((p) => p.notionId === notion.id)?.totalCards ?? 0) > 0);
          const generateLabel = generating ? "Création en cours…" : allNotionsHaveCards ? "Régénérer les fiches" : "Créer les fiches";

          return (
            <>
              <div className="flex flex-wrap items-center gap-4">
                <Button variant="secondary" className="rounded-2xl" disabled={generating || selectedTypes.size === 0} onClick={() => void handleGenerate()}>
                  {generateLabel}
                </Button>
                <fieldset className="flex flex-wrap items-center gap-4 text-sm text-text-muted" disabled={generating}>
                  <legend className="mb-1 text-[length:var(--text-label)] text-text-muted">Types de fiches à créer</legend>
                  {ALL_CARD_TYPES.map((type) => (
                    <label key={type} className="flex items-center gap-2">
                      <input type="checkbox" checked={selectedTypes.has(type)} onChange={() => toggleType(type)} />
                      {CARD_TYPE_LABEL[type]}
                    </label>
                  ))}
                </fieldset>
                {generating && (
                  <p aria-live="polite" className="text-sm text-text-muted">
                    {generationStatus ? `${generationStatus.done + generationStatus.failed} / ${generationStatus.total} fiches créées` : "Création en cours…"}
                  </p>
                )}
                {generateError && <p role="alert">Impossible de créer les fiches. Vérifie ta connexion et réessaie.</p>}
              </div>

              <div className="flex flex-col gap-3">
                {notions.map((notion) => (
                  <NotionCard
                    key={notion.id}
                    notion={notion}
                    notionProgress={notionsProgress?.find((p) => p.notionId === notion.id)}
                    colour={document.colour}
                    todayKey={todayKey}
                    expanded={expandedNotionIds.has(notion.id)}
                    onToggleBody={() => toggleBody(notion.id)}
                    onReview={() => onReview(notion.id)}
                  />
                ))}
              </div>
            </>
          );
        })()}
    </div>
  );
}

// Redesigned per a "Notions" mockup, ignoring docs/UI.md per the user: one
// unified page (a course-picker row of pills, then that course's own
// summary card and notion list), not a separate picker page you leave to
// reach a course's notions. documentId (still optional, from App.tsx's own
// View) keeps every existing deep link working exactly as before (Progrès'
// "Voir le cours", Agenda's day panel, Lecteur/Tuteur's own "Retour"
// targets) — when set, that course is pre-selected and "Retour à mes cours"
// reappears; when absent (the nav's own direct entry, M9), no back link at
// all, matching Aujourd'hui/Mes cours' own top-level pages, and the first
// course is selected by default. Switching pills is a local selection, not
// a view transition — onSelectDocument is gone, there is no separate picker
// view left to transition into.
//
// Two unconditional queries live here now (listDocuments, getToday), unlike
// the single-branch dispatcher this replaces: safe because both always run
// on every render regardless of which course is selected — the rule this
// used to guard against was conditional hooks changing count between
// renders, not "no hooks at all" (TutorScreen's own picker/chat split, kept
// as precedent for the pattern, not for a hook count of zero).
export function NotionsScreen({
  documentId,
  onBack,
  onReview,
  onOpenProgress,
  onOpenReader,
  onOpenTutor,
}: {
  documentId?: string;
  onBack: () => void;
  // Each callback takes the resolved documentId explicitly, matching
  // DocumentsScreen's own onReviewCourse/onOpenReader shape — this screen's
  // own selected course lives in local state (the pill row below), not in
  // App.tsx's own view.documentId, which stays undefined for the nav's
  // direct entry even after picking a different course by hand.
  onReview: (documentId: string, notionId?: string) => void;
  onOpenProgress: (documentId: string) => void;
  onOpenReader: (documentId: string) => void;
  onOpenTutor: (documentId: string) => void;
}) {
  const documentsQuery = useQuery({ queryKey: ["documents"], queryFn: listDocuments });
  const todayQuery = useQuery({ queryKey: ["today"], queryFn: getToday });
  const [manualSelection, setManualSelection] = useState<string | undefined>(undefined);

  if (documentsQuery.status === "pending") {
    return (
      <main className="p-8">
        <h1 className="mb-[var(--space-section)] font-[family-name:var(--font-display)] text-2xl font-extrabold">Notions</h1>
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
      <main className="flex flex-col items-center gap-[var(--space-section)] p-8 text-center">
        <Confused />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Notions</h1>
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
      <main className="flex flex-col items-center gap-4 p-8 text-center">
        <Idle />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Notions</h1>
        <p>Ajoute un cours dans Mes cours pour voir ses notions.</p>
      </main>
    );
  }

  const selectedId = documentId ?? manualSelection ?? documents[0]!.id;
  const selectedDocument = documents.find((d) => d.id === selectedId) ?? documents[0]!;
  const dueCount = todayQuery.data?.dueCards.find((c) => c.documentId === selectedDocument.id)?.count ?? 0;

  return (
    <main className="p-8">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Notions</h1>
      <p className="mb-[var(--space-section)] text-sm text-text-muted">Chaque notion est une idée tirée de ton cours. Révise-la pour renforcer sa maîtrise.</p>

      <div className="mb-[var(--space-section)] flex flex-wrap gap-2">
        {documents.map((document) => (
          <CoursePill key={document.id} document={document} active={document.id === selectedDocument.id} onSelect={() => setManualSelection(document.id)} />
        ))}
      </div>

      <NotionsCourseScreen
        key={selectedDocument.id}
        document={selectedDocument}
        dueCount={dueCount}
        showBackLink={documentId !== undefined}
        onBack={onBack}
        onReview={(notionId) => onReview(selectedDocument.id, notionId)}
        onOpenProgress={() => onOpenProgress(selectedDocument.id)}
        onOpenReader={() => onOpenReader(selectedDocument.id)}
        onOpenTutor={() => onOpenTutor(selectedDocument.id)}
      />
    </main>
  );
}
