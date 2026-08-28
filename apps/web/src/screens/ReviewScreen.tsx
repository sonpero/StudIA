import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Confused } from "../components/mascot/Confused.js";
import { Sleeping } from "../components/mascot/Sleeping.js";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { getProgress } from "../lib/notions-api.js";
import { abandonSession, startSession, submitReview, type CardSchedule, type DueCard, type Rating } from "../lib/review-api.js";

const RATING_LABEL: Record<Rating, string> = { 1: "À revoir", 2: "Difficile", 3: "Correct", 4: "Facile" };

const dueDateFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

function formatDate(iso: string): string {
  return dueDateFormatter.format(new Date(iso));
}

function formatDueDate(schedule: CardSchedule | null): string {
  return schedule ? formatDate(schedule.due) : "Nouvelle fiche";
}

export function ReviewScreen({ documentId, notionId, onLeave }: { documentId?: string; notionId?: string; onLeave: () => void }) {
  const queryClient = useQueryClient();
  const [revealed, setRevealed] = useState(false);
  const [index, setIndex] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const sessionQuery = useQuery({
    queryKey: ["review-session", documentId, notionId],
    queryFn: async () => {
      const result = await startSession(documentId, notionId);
      setStartedAt(Date.now());
      return result;
    },
  });

  // Backs the empty state's "next due date" and the completion recap.
  // Shares NotionsScreen's ["progress", documentId] cache entry — often
  // already warm from the screen the user just came from — and is the
  // query item 5's post-rating invalidation targets.
  const progressQuery = useQuery({
    queryKey: ["progress", documentId],
    queryFn: () => getProgress(documentId!),
    enabled: Boolean(documentId),
  });

  async function handleLeave() {
    if (sessionQuery.data) await abandonSession(sessionQuery.data.sessionId).catch(() => undefined);
    onLeave();
  }

  async function rate(card: DueCard, rating: Rating) {
    if (submitting) return;
    setSubmitting(true);
    try {
      await submitReview(card.cardId, rating, Date.now() - (startedAt ?? Date.now()));
      if (documentId) {
        void queryClient.invalidateQueries({ queryKey: ["progress", documentId] });
        void queryClient.invalidateQueries({ queryKey: ["notions-progress", documentId] });
      }
      setIndex((i) => i + 1);
      setRevealed(false);
      setStartedAt(Date.now());
    } finally {
      setSubmitting(false);
    }
  }

  if (sessionQuery.status === "pending") {
    return (
      <main className="flex flex-col items-center gap-4 p-8">
        <h1 className="font-[var(--font-display)] text-2xl font-extrabold">Révision</h1>
        <div className="h-48 w-full max-w-md animate-pulse rounded-[var(--radius-card)] bg-border" />
      </main>
    );
  }

  if (sessionQuery.status === "error") {
    return (
      <main className="flex flex-col items-center gap-4 p-8 text-center">
        <Confused />
        <h1 className="font-[var(--font-display)] text-2xl font-extrabold">Révision</h1>
        <p>Impossible de démarrer la révision. Vérifie ta connexion et réessaie.</p>
        <Button onClick={() => void sessionQuery.refetch()}>Réessayer</Button>
      </main>
    );
  }

  const { cards } = sessionQuery.data;

  // Pure spaced repetition, no training-mode filler: nothing due is the
  // normal, expected state, not a gap to explain away.
  const nextDueDate = progressQuery.data?.nextDueDate;

  if (cards.length === 0) {
    return (
      <main className="flex flex-col items-center gap-4 p-8 text-center">
        <Sleeping />
        <h1 className="font-[var(--font-display)] text-2xl font-extrabold">Révision</h1>
        <p>Tout est à jour.</p>
        {nextDueDate && <p className="text-sm text-text-muted">Prochaine fiche à réviser le {formatDate(nextDueDate)}.</p>}
        <Button variant="secondary" onClick={onLeave}>
          Retour
        </Button>
      </main>
    );
  }

  const current = cards[index];

  if (!current) {
    return (
      <main className="flex flex-col items-center gap-4 p-8 text-center">
        <h1 className="font-[var(--font-display)] text-2xl font-extrabold">Révision</h1>
        <p>Tu as terminé cette session.</p>
        <p className="text-sm text-text-muted">
          Tu as revu {cards.length} fiche{cards.length > 1 ? "s" : ""}.
        </p>
        {nextDueDate && <p className="text-sm text-text-muted">Prochaine fiche à réviser le {formatDate(nextDueDate)}.</p>}
        <Button variant="accent" onClick={onLeave}>
          Retour
        </Button>
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center gap-6 p-8">
      <div className="flex w-full max-w-md items-center justify-between">
        <h1 className="font-[var(--font-display)] text-2xl font-extrabold">Révision</h1>
        <button type="button" className="text-sm text-text-muted underline" onClick={() => void handleLeave()}>
          Quitter
        </button>
      </div>

      <Card className="flex min-h-48 w-full max-w-md flex-col justify-center gap-4 p-8 text-center">
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>Échéance : {formatDueDate(current.schedule)}</span>
          {current.mastered && (
            <span className="rounded-full bg-success/10 px-2 py-0.5 font-medium text-success">Maîtrisée</span>
          )}
        </div>
        <p className="text-lg">{current.question}</p>
        {revealed && <p className="text-lg text-primary">{current.answer}</p>}
        {current.state === "stale" && <p className="text-xs text-text-muted">Cette fiche peut être obsolète, la notion a changé.</p>}
      </Card>

      {!revealed ? (
        <Button onClick={() => setRevealed(true)}>Révéler la réponse</Button>
      ) : (
        <div className="flex gap-2">
          {([1, 2, 3, 4] as Rating[]).map((rating) => (
            <Button key={rating} variant="secondary" disabled={submitting} onClick={() => void rate(current, rating)}>
              {RATING_LABEL[rating]}
            </Button>
          ))}
        </div>
      )}
    </main>
  );
}
