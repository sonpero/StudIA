import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Repeat } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import { Confused } from "../components/mascot/Confused.js";
import { Idle } from "../components/mascot/Idle.js";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { ICON_SIZE_INLINE, ICON_STROKE_WIDTH } from "../lib/icons.js";
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

// "fiche(s)" and "a"/"ont" agree with the denominator, not the numerator
// (docs/UI.md's Notions du cours note): "X/Y fiches ont …" reads as "X out
// of Y fiches", so it's the population (Y) the noun and verb answer to.
// Plural whenever the notion has more than one fiche at all, singular only
// when it has exactly one — never keyed off the numerator, which would
// make 0/3 and 1/3 both read as a false singular.
function fractionCountSentence(count: number, total: number, rest: string): string {
  const plural = total > 1;
  return `${count}/${total} fiche${plural ? "s" : ""} ${plural ? "ont" : "a"} ${rest}`;
}

type MasteryGap = { sentence: string; detail: string };

// isMastered (docs/modules/review.md) is two independent conditions, so
// "not yet mastered" can mean either is missing — this decides which single
// sentence to show, and never re-derives the thresholds themselves (21
// days, 3 reps): it only compares the two pre-computed counts to
// totalCards, both already measured against mastery.ts's own constants on
// the server (review's own NotionProgress).
function notionMasteryGap(progress: NotionProgress | undefined): MasteryGap | null {
  if (!progress) return null;
  const { totalCards, masteredCards, cardsWithEnoughReps, cardsWithEnoughStability } = progress;
  // Deliberately not masteredCards > 0 as well: 0 / N is the single most
  // common case this exists to explain, not an edge case to exclude
  // (docs/UI.md's Notions du cours note).
  if (totalCards === 0 || masteredCards >= totalCards) return null;

  const detail = `${fractionCountSentence(cardsWithEnoughReps, totalCards, "fait 3 révisions")} · ${fractionCountSentence(cardsWithEnoughStability, totalCards, "dépassé 21 jours de stabilité")}`;

  // Reps first: immediately actionable (réviser), whereas a stability gap
  // needs spacing, not a fresh review right now — the priority docs/UI.md's
  // Notions du cours note settles.
  if (cardsWithEnoughReps < totalCards) {
    return { sentence: "Il te manque encore des révisions sur cette notion.", detail };
  }
  if (cardsWithEnoughStability < totalCards) {
    return { sentence: "Tu l'as révisée assez souvent, il faut maintenant l'espacer dans le temps.", detail };
  }
  // Both counts already meet totalCards while masteredCards doesn't:
  // contradicts isMastered's own definition (mastery.ts), so this should
  // never actually happen. Say nothing rather than show a sentence that
  // wouldn't match what was counted.
  return null;
}

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

export function NotionsScreen({
  documentId,
  onBack,
  onReview,
  onOpenProgress,
  onOpenReader,
}: {
  documentId: string;
  onBack: () => void;
  onReview: (notionId?: string) => void;
  onOpenProgress: () => void;
  onOpenReader: () => void;
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
        <h1 className="mb-[var(--space-section)] font-[family-name:var(--font-display)] text-2xl font-extrabold">Notions du cours</h1>
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
      <main className="flex flex-col items-center gap-[var(--space-section)] p-8 text-center">
        <Confused />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Notions du cours</h1>
        <p>Impossible de charger les notions de ce cours. Vérifie ta connexion et réessaie.</p>
        <Button onClick={() => void notionsQuery.refetch()}>Réessayer</Button>
      </main>
    );
  }

  const notions = notionsQuery.data;

  if (notions.length === 0) {
    return (
      <main className="flex flex-col items-center gap-[var(--space-section)] p-8 text-center">
        <Idle />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Notions du cours</h1>
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
      <div>
        {/* "Retour à mes cours" sits on its own line above the title, flush
            left — not beside the title, not sharing its line at all
            (docs/UI.md's Notions du cours note). Two corrections, not one:
            the original bug paired it with the title on one line; the
            first fix moved it under the toolbar, right-aligned, which
            cleared that but put it in the wrong place entirely — a back
            link reads top-left, before the title, by convention. Tab
            order follows: this link first, then the toolbar's three
            actions. */}
        <button type="button" className="mb-[var(--space-block)] text-sm text-text-muted underline" onClick={onBack}>
          Retour à mes cours
        </button>
        <div className="mb-[var(--space-section)] flex flex-wrap items-start justify-between gap-4">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Notions du cours</h1>
          {/* "Créer les fiches" / "Régénérer les fiches" lives apart from
              this toolbar, not in it (below, by its own type checkboxes):
              rare, and destructive once it reads "Régénérer" (it destroys
              the existing cards and starts over), so it does not belong at
              the same visual level as this toolbar's own actions.
              "Réviser" is this screen's own action and the only Button
              left here — "Lire le cours" / "Voir la progression" leave for
              another screen, so they demote to a plain link, the same
              idiom "Retour à mes cours" already uses (docs/UI.md's Shape
              and depth note): what actually closes the 375px gap this
              toolbar used to overflow, not a wrap or a shorter label. */}
          <div className="flex items-center gap-3" data-testid="notions-toolbar">
            {/* --text-display is a card's own number, never page chrome
                (docs/UI.md's Type note): this count sits in the toolbar
                between the page title and the toolbar's own actions, so it
                renders at the same size as the labels beside it, text-sm,
                not the 32px display size that used to make it outweigh the
                page's own <h1>. */}
            {progress && (
              <p className="text-sm text-text-muted">
                <span className="text-sm tabular-nums">{progress.mastered}</span> / {progress.total} notions maîtrisées
              </p>
            )}
            <button type="button" className="text-sm text-text-muted underline" onClick={onOpenReader}>
              Lire le cours
            </button>
            <button type="button" className="text-sm text-text-muted underline" onClick={onOpenProgress}>
              Voir la progression
            </button>
            {/* Accent, matching every notion card's own "Réviser cette
                notion" below (docs/UI.md's Colour note): the same word
                names the same gesture on this screen, whole-document here
                versus scoped to one notion there. This button sits
                outside every card, so it never doubles the one-accent-
                per-card invariant those cards each already satisfy on
                their own. */}
            <Button variant="accent" onClick={() => onReview()}>
              Réviser
            </Button>
          </div>
        </div>
      </div>

      {/* --space-block (16px) below, not the --space-section (24px) this
          used to share with the header above (docs/UI.md's Notions du
          cours note): identical distances on both sides read as belonging
          to neither, and this block acts on the list below it, not the
          header. The header side stays --space-section unchanged — that
          boundary was already correct. */}
      <div className="mb-[var(--space-block)] flex flex-wrap items-center gap-4">
        <Button variant="secondary" disabled={generating || selectedTypes.size === 0} onClick={() => void handleGenerate()}>
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
        {notions.map((notion) => {
          const notionProgress = notionsProgress?.find((p) => p.notionId === notion.id);
          const expanded = expandedNotionIds.has(notion.id);
          return (
            <Card key={notion.id} className="flex flex-col gap-3" data-testid="notion-card">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-[family-name:var(--font-display)] text-[length:var(--text-title)] font-extrabold">{notion.title}</h3>
                  {/* --space-related (8px): a title and its own descriptor
                      read as one unit (docs/UI.md's Notions du cours note)
                      — there was no gap class here at all before, invisible
                      while the title rendered as plain text, a real defect
                      once it renders as actual bold 20px display type. */}
                  <p className="mt-[var(--space-related)] text-sm text-text-muted">{DIFFICULTY_LABEL[notion.difficulty]}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm text-text-muted">{notionProgressLabel(notionProgress)}</p>
                  <Button variant="accent" onClick={() => onReview(notion.id)}>
                    <Repeat aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
                    Réviser cette notion
                  </Button>
                </div>
              </div>
              {(() => {
                const gap = notionMasteryGap(notionProgress);
                if (!gap) return null;
                // A fact, not a warning (docs/UI.md's Colour note): no
                // --warning, no colour of any kind. The detail is one size
                // down from the sentence (--text-label vs text-sm) — it
                // accompanies, it never dominates.
                return (
                  <div className="flex flex-col gap-1">
                    <p className="text-sm text-text-muted">{gap.sentence}</p>
                    <p className="text-[length:var(--text-label)] text-text-muted">{gap.detail}</p>
                  </div>
                );
              })()}
              <button
                type="button"
                className="self-start text-sm text-primary underline"
                aria-expanded={expanded}
                onClick={() => toggleBody(notion.id)}
              >
                {expanded ? "Masquer le contenu" : "Voir le contenu"}
              </button>
              {expanded && <Markdown components={NOTION_BODY_COMPONENTS}>{notion.body}</Markdown>}
            </Card>
          );
        })}
      </div>
    </main>
  );
}
