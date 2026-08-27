import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Confused } from "../components/mascot/Confused.js";
import { Sleeping } from "../components/mascot/Sleeping.js";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { abandonSession, startSession, submitReview, type DueCard, type Rating } from "../lib/review-api.js";

const RATING_LABEL: Record<Rating, string> = { 1: "À revoir", 2: "Difficile", 3: "Correct", 4: "Facile" };

export function ReviewScreen({ documentId, onLeave }: { documentId?: string; onLeave: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const [index, setIndex] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const sessionQuery = useQuery({
    queryKey: ["review-session", documentId],
    queryFn: async () => {
      const result = await startSession(documentId);
      setStartedAt(Date.now());
      return result;
    },
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

  if (cards.length === 0) {
    return (
      <main className="flex flex-col items-center gap-4 p-8 text-center">
        <Sleeping />
        <h1 className="font-[var(--font-display)] text-2xl font-extrabold">Révision</h1>
        <p>Rien à réviser pour l'instant.</p>
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
