import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Confused } from "../components/mascot/Confused.js";
import { Idle } from "../components/mascot/Idle.js";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import {
  generateCardsForDocument,
  getGenerationStatus,
  getNotionsProgress,
  getProgress,
  listNotions,
  type CardType,
  type Difficulty,
  type NotionProgress,
} from "../lib/notions-api.js";

// Generation is much faster than extraction (a handful of small LLM calls,
// not a whole document read), so a fixed short interval is enough — no need
// for DocumentsScreen/NotionsScreen's 30s backoff.
const GENERATION_POLL_MS = 1500;

const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: "Facile", medium: "Moyen", hard: "Difficile" };
// User choice of activity type (docs/modules/generation.md's open question,
// settled in M4): flashcard checked by default, matching M3's behaviour.
const CARD_TYPE_LABEL: Record<CardType, string> = { flashcard: "Flashcards", mcq: "QCM", open: "Questions ouvertes" };
const ALL_CARD_TYPES: CardType[] = ["flashcard", "mcq", "open"];

function notionProgressLabel(progress: NotionProgress | undefined): string {
  if (!progress || progress.totalCards === 0) return "Pas encore de fiches";
  return `${progress.masteredCards} / ${progress.totalCards} fiches maîtrisées`;
}

// Splitting into notions runs automatically after extraction
// (docs/modules/content.md), asynchronously — never block the UI on a job
// (docs/UI.md). Poll while there is nothing to show yet, backing off after
// 30 seconds like DocumentsScreen's extraction poll, and give up after 2
// minutes: content has no split-status endpoint to say "still running" vs.
// "genuinely produced nothing", so an unbounded poll would never stop for a
// document whose split job actually failed.
const POLL_GIVE_UP_MS = 120_000;

export function NotionsScreen({
  documentId,
  onBack,
  onReview,
  onOpenPlanning,
}: {
  documentId: string;
  onBack: () => void;
  onReview: (notionId?: string) => void;
  onOpenPlanning: () => void;
}) {
  const queryClient = useQueryClient();
  const pollStartedAt = useRef<number | null>(null);
  const [expandedNotionIds, setExpandedNotionIds] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<Set<CardType>>(new Set<CardType>(["flashcard"]));

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
  const progressQuery = useQuery({ queryKey: ["progress", documentId], queryFn: () => getProgress(documentId) });
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

  if (notionsQuery.status === "pending") {
    return (
      <main className="p-8">
        <h1 className="mb-6 font-[var(--font-display)] text-2xl font-extrabold">Notions du cours</h1>
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-[var(--radius-card)] bg-border" />
          ))}
        </div>
      </main>
    );
  }

  if (notionsQuery.status === "error") {
    return (
      <main className="flex flex-col items-center gap-4 p-8 text-center">
        <Confused />
        <h1 className="font-[var(--font-display)] text-2xl font-extrabold">Notions du cours</h1>
        <p>Impossible de charger les notions de ce cours. Vérifie ta connexion et réessaie.</p>
        <Button onClick={() => void notionsQuery.refetch()}>Réessayer</Button>
      </main>
    );
  }

  const notions = notionsQuery.data;

  if (notions.length === 0) {
    return (
      <main className="flex flex-col items-center gap-4 p-8 text-center">
        <Idle />
        <h1 className="font-[var(--font-display)] text-2xl font-extrabold">Notions du cours</h1>
        <p>Les notions de ce cours n'ont pas encore été créées. Reviens un peu plus tard.</p>
        <Button variant="secondary" onClick={onBack}>
          Retour à mes cours
        </Button>
      </main>
    );
  }

  const progress = progressQuery.data;
  const notionsProgress = notionsProgressQuery.data;
  const allNotionsHaveCards =
    notionsProgress !== undefined && notions.every((notion) => (notionsProgress.find((p) => p.notionId === notion.id)?.totalCards ?? 0) > 0);
  const generateLabel = generating ? "Création en cours…" : allNotionsHaveCards ? "Régénérer les fiches" : "Créer les fiches";

  return (
    <main className="p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button type="button" className="text-sm text-text-muted underline" onClick={onBack}>
            Retour à mes cours
          </button>
          <h1 className="font-[var(--font-display)] text-2xl font-extrabold">Notions du cours</h1>
        </div>
        <div className="flex items-center gap-3">
          {progress && (
            <p className="text-sm text-text-muted">
              {progress.mastered} / {progress.total} notions maîtrisées
            </p>
          )}
          {generating && (
            <p aria-live="polite" className="text-sm text-text-muted">
              {generationStatus ? `${generationStatus.done + generationStatus.failed} / ${generationStatus.total} fiches créées` : "Création en cours…"}
            </p>
          )}
          {generateError && <p role="alert">Impossible de créer les fiches. Vérifie ta connexion et réessaie.</p>}
          <Button variant="secondary" disabled={generating || selectedTypes.size === 0} onClick={() => void handleGenerate()}>
            {generateLabel}
          </Button>
          <Button variant="secondary" onClick={onOpenPlanning}>
            Planning
          </Button>
          <Button variant="accent" onClick={() => onReview()}>
            Réviser
          </Button>
        </div>
      </div>

      <fieldset className="mb-6 flex flex-wrap items-center gap-4 text-sm text-text-muted" disabled={generating}>
        <legend className="mb-1 text-sm text-text-muted">Types de fiches à créer</legend>
        {ALL_CARD_TYPES.map((type) => (
          <label key={type} className="flex items-center gap-2">
            <input type="checkbox" checked={selectedTypes.has(type)} onChange={() => toggleType(type)} />
            {CARD_TYPE_LABEL[type]}
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-3">
        {notions.map((notion) => {
          const notionProgress = notionsProgress?.find((p) => p.notionId === notion.id);
          const expanded = expandedNotionIds.has(notion.id);
          return (
            <Card key={notion.id} className="flex flex-col gap-3" data-testid="notion-card">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-[var(--font-display)] text-base font-extrabold">{notion.title}</h3>
                  <p className="text-sm text-text-muted">{DIFFICULTY_LABEL[notion.difficulty]}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm text-text-muted">{notionProgressLabel(notionProgress)}</p>
                  <Button variant="secondary" onClick={() => onReview(notion.id)}>
                    Réviser cette notion
                  </Button>
                </div>
              </div>
              <button
                type="button"
                className="self-start text-sm text-primary underline"
                aria-expanded={expanded}
                onClick={() => toggleBody(notion.id)}
              >
                {expanded ? "Masquer le contenu" : "Voir le contenu"}
              </button>
              {expanded && <p className="text-sm text-text">{notion.body}</p>}
            </Card>
          );
        })}
      </div>
    </main>
  );
}
