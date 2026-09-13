import type { DocumentSummary, ExtractionStatus } from "@studia/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BookOpen, BookOpenText, FileText, Image as ImageIcon, Layers, RotateCw, Trash2 } from "lucide-react";
import { useRef } from "react";
import { Confused } from "../components/mascot/Confused.js";
import { Reading } from "../components/mascot/Reading.js";
import { Card } from "../components/ui/card.js";
import { Button } from "../components/ui/button.js";
import { UploadCard } from "../components/UploadCard.js";
import { deleteDocument, listDocuments, retryExtraction } from "../lib/documents-api.js";
import { ICON_SIZE_INLINE, ICON_STROKE_WIDTH } from "../lib/icons.js";
import { getProgress } from "../lib/notions-api.js";
import { EXPAND_TAP_TARGET_44 } from "../lib/tap-target.js";
import { getToday } from "../lib/today-api.js";
import { countdownLabel } from "./TodayScreen.js";

const STATUS_LABEL: Record<ExtractionStatus, string> = {
  pending: "En attente",
  running: "Lecture en cours…",
  done: "Terminé",
  failed: "Échec",
};

function isActive(status: ExtractionStatus): boolean {
  return status === "pending" || status === "running";
}

// Redesigned per a "Mes cours" mockup, ignoring docs/UI.md per the user.
// A course card's subject icon sits in a tinted circle (a document.colour
// tint, generic BookOpen icon), the same knowing departure from docs/UI.md's
// "left border, not a tinted background" rule already made for Aujourd'hui's
// own redesigned course cards — kept visually consistent between the two.
//
// The mockup shows several distinct "materials" (separate uploads: a PDF, a
// second PDF, a photo) grouped under one course card, with its own panel to
// add more material to an EXISTING course later. That grouping doesn't
// exist in this app yet — a course is still exactly one upload (one title,
// one page set) — so, per the user's own call, this stays front-end only:
// one material chip per card, built from that same document's own title/
// pageCount/sourceType, and the upload panel on the right only ever creates
// a new course, the same capability it already had.
function DocumentCard({
  document,
  dueCount,
  deadlineDaysAway,
  onChanged,
  onOpenReader,
  onReviewCourse,
}: {
  document: DocumentSummary;
  dueCount: number;
  deadlineDaysAway: number | null;
  onChanged: () => void;
  onOpenReader: (documentId: string) => void;
  onReviewCourse: (documentId: string) => void;
}) {
  const progressQuery = useQuery({
    queryKey: ["document-progress", document.id],
    queryFn: () => getProgress(document.id),
    enabled: document.status === "done",
  });
  const MaterialIcon = document.sourceType === "photo" ? ImageIcon : FileText;

  return (
    <Card className="flex flex-col gap-[var(--space-block)]" data-testid="document-card">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-[var(--space-related)]">
          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${document.colour}26` }}>
            <BookOpen size={24} strokeWidth={ICON_STROKE_WIDTH} color={document.colour} />
          </span>
          <h3 className="truncate font-[family-name:var(--font-display)] text-[length:var(--text-title)] font-extrabold">{document.title}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {deadlineDaysAway !== null && (
            <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[length:var(--text-label)] font-semibold text-warning">{countdownLabel(deadlineDaysAway)}</span>
          )}
          <button
            type="button"
            aria-label={`Supprimer « ${document.title} »`}
            onClick={() => void deleteDocument(document.id).then(onChanged)}
            className={`flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-canvas hover:text-text ${EXPAND_TAP_TARGET_44}`}
          >
            <Trash2 aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
          </button>
        </div>
      </div>

      <p className="text-sm">
        {document.pageCount} page{document.pageCount > 1 ? "s" : ""}
      </p>

      {document.status !== "done" ? (
        <p aria-live="polite" className="text-sm">
          {STATUS_LABEL[document.status]}
        </p>
      ) : (
        <>
          {progressQuery.data && (
            <div data-testid="course-stats" className="flex items-center gap-1.5 text-sm text-text-muted">
              <Layers aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
              <p>
                {progressQuery.data.total} notion{progressQuery.data.total > 1 ? "s" : ""} · {progressQuery.data.mastered} maîtrisée
                {progressQuery.data.mastered > 1 ? "s" : ""} · <strong className="font-semibold text-text">{dueCount} à réviser</strong>
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-canvas px-3 py-1.5 text-sm">
              <MaterialIcon aria-hidden="true" focusable="false" size={14} strokeWidth={ICON_STROKE_WIDTH} className="text-text-muted" />
              {document.title} · {document.pageCount}p
            </span>
          </div>
        </>
      )}

      {document.status === "failed" && (
        <Button variant="secondary" className="rounded-2xl" onClick={() => void retryExtraction(document.id).then(onChanged)}>
          <RotateCw aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
          Réessayer
        </Button>
      )}

      {document.status === "done" && (
        <div className="flex gap-2">
          {dueCount > 0 ? (
            <Button variant="accent" className="rounded-2xl" onClick={() => onReviewCourse(document.id)}>
              Réviser
              <ArrowRight aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
            </Button>
          ) : (
            <Button variant="secondary" className="rounded-2xl" disabled>
              Rien à réviser
            </Button>
          )}
          <Button variant="secondary" className="rounded-2xl border-transparent bg-primary-soft text-primary hover:bg-primary-soft" onClick={() => onOpenReader(document.id)}>
            <BookOpenText aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
            Lire le cours
          </Button>
        </div>
      )}
    </Card>
  );
}

export function DocumentsScreen({
  onOpenReader,
  onReviewCourse,
}: {
  onOpenReader: (documentId: string) => void;
  onReviewCourse: (documentId: string) => void;
}) {
  const queryClient = useQueryClient();
  const pollStartedAt = useRef<number | null>(null);

  const query = useQuery({
    queryKey: ["documents"],
    queryFn: listDocuments,
    refetchInterval: (q) => {
      const documents = q.state.data;
      const active = documents?.some((d) => isActive(d.status)) ?? false;
      if (!active) {
        pollStartedAt.current = null;
        return false;
      }
      pollStartedAt.current ??= Date.now();
      // TanStack Query with refetchInterval while status is not terminal,
      // backing off after 30 seconds (docs/UI.md).
      return Date.now() - pollStartedAt.current > 30_000 ? 10_000 : 2_000;
    },
  });
  // Shared with AppNav/TodayScreen (same ["today"] cache): dueCards and
  // upcomingDeadlines are already exactly "due today, per course" and "next
  // deadline, per course" — no separate read of this screen's own invented
  // shape needed.
  const todayQuery = useQuery({ queryKey: ["today"], queryFn: getToday });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["documents"] });

  const documents = query.data;
  const dueCountByDocumentId = new Map(todayQuery.data?.dueCards.map((c) => [c.documentId, c.count]) ?? []);
  const deadlineByDocumentId = new Map(todayQuery.data?.upcomingDeadlines.map((d) => [d.documentId, d.daysAway]) ?? []);

  return (
    <main className="flex flex-col gap-[var(--space-section)] p-4 md:p-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Mes cours</h1>
        <p className="text-sm text-text-muted">Importe tes notes et StudIA les transforme en notions, fiches et un plan de révision.</p>
      </div>

      {/* A plain flex row, not the title's own column — the upload panel's
          own top edge lines up with the first course card (this row's
          other top item), not with the title sitting above it. */}
      <div className="flex flex-col gap-[var(--space-section)] md:flex-row">
        <div className="flex-1">
          {query.status === "pending" && (
            <div className="flex flex-col gap-[var(--space-block)]">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-40 animate-pulse rounded-[var(--radius-card)] bg-border" />
              ))}
            </div>
          )}

          {query.status === "error" && (
            <div className="flex flex-col items-center gap-[var(--space-section)] text-center">
              <Confused />
              <p>Impossible de charger tes cours. Vérifie ta connexion et réessaie.</p>
              <Button onClick={() => void query.refetch()}>Réessayer</Button>
            </div>
          )}

          {documents &&
            (documents.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-12 text-center">
                <Reading />
                <p>Aucun cours pour l'instant. Prends ton cours en photo pour commencer.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-[var(--space-block)]">
                {documents.map((document) => (
                  <DocumentCard
                    key={document.id}
                    document={document}
                    dueCount={dueCountByDocumentId.get(document.id) ?? 0}
                    deadlineDaysAway={deadlineByDocumentId.get(document.id) ?? null}
                    onChanged={refresh}
                    onOpenReader={onOpenReader}
                    onReviewCourse={onReviewCourse}
                  />
                ))}
              </div>
            ))}
        </div>
        <div className="w-full md:w-[320px] md:shrink-0">
          <UploadCard onCreated={refresh} />
        </div>
      </div>
    </main>
  );
}
