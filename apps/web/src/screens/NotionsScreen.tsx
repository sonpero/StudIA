import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { Confused } from "../components/mascot/Confused.js";
import { Idle } from "../components/mascot/Idle.js";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { generateCardsForDocument, getProgress, listNotions, type Difficulty } from "../lib/notions-api.js";

const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: "Facile", medium: "Moyen", hard: "Difficile" };

// Splitting into notions runs automatically after extraction
// (docs/modules/content.md), asynchronously — never block the UI on a job
// (docs/UI.md). Poll while there is nothing to show yet, backing off after
// 30 seconds like DocumentsScreen's extraction poll, and give up after 2
// minutes: content has no split-status endpoint to say "still running" vs.
// "genuinely produced nothing", so an unbounded poll would never stop for a
// document whose split job actually failed.
const POLL_GIVE_UP_MS = 120_000;

export function NotionsScreen({ documentId, onBack, onReview }: { documentId: string; onBack: () => void; onReview: () => void }) {
  const queryClient = useQueryClient();
  const pollStartedAt = useRef<number | null>(null);

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

  async function handleGenerate() {
    await generateCardsForDocument(documentId);
    void queryClient.invalidateQueries({ queryKey: ["progress", documentId] });
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

  return (
    <main className="p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-[var(--font-display)] text-2xl font-extrabold">Notions du cours</h1>
        <div className="flex items-center gap-3">
          {progress && (
            <p className="text-sm text-text-muted">
              {progress.mastered} / {progress.total} notions maîtrisées
            </p>
          )}
          <Button variant="secondary" onClick={() => void handleGenerate()}>
            Créer les fiches
          </Button>
          <Button variant="accent" onClick={onReview}>
            Réviser
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {notions.map((notion) => (
          <Card key={notion.id} className="flex items-center justify-between gap-4" data-testid="notion-card">
            <div>
              <h3 className="font-[var(--font-display)] text-base font-extrabold">{notion.title}</h3>
              <p className="text-sm text-text-muted">{DIFFICULTY_LABEL[notion.difficulty]}</p>
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}
