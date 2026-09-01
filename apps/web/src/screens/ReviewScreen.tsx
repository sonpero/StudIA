import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { Confused } from "../components/mascot/Confused.js";
import { Sleeping } from "../components/mascot/Sleeping.js";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { ICON_SIZE_INLINE, ICON_STROKE_WIDTH } from "../lib/icons.js";
import { getProgress } from "../lib/notions-api.js";
import { abandonSession, gradeAnswer, startSession, submitReview, type CardSchedule, type DueCard, type GradeResult, type Rating } from "../lib/review-api.js";

const RATING_LABEL: Record<Rating, string> = { 1: "À revoir", 2: "Difficile", 3: "Correct", 4: "Facile" };

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

// Purely a display reveal, never a scoring decision: once the server has
// graded the answer, highlight which of the four options was the correct
// one. current.answer is already part of the DueCard payload the browser
// holds regardless (shown after a flashcard reveal too), so this discloses
// nothing new — the actual rating always comes from gradeAnswer's server
// response (review/application/grade-answer.ts, review/domain/grade-mcq.ts),
// never recomputed here.
function isCorrectOption(option: string, answer: string): boolean {
  return normalize(option) === normalize(answer);
}

const dueDateFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

function formatDate(iso: string): string {
  return dueDateFormatter.format(new Date(iso));
}

function formatDueDate(schedule: CardSchedule | null): string {
  return schedule ? formatDate(schedule.due) : "Nouvelle fiche";
}

// nextDueDate is never today: dueness is a calendar-day threshold
// (getProgress only counts due >= tomorrow's start), so a card due later
// today is already revisable now, not "next".
function nextDueDateMessage(nextDueDate: string | null | undefined): string | null {
  return nextDueDate ? `Prochaine fiche à réviser le ${formatDate(nextDueDate)}.` : null;
}

export function ReviewScreen({ documentId, notionId, onLeave }: { documentId?: string; notionId?: string; onLeave: () => void }) {
  const queryClient = useQueryClient();
  const [revealed, setRevealed] = useState(false);
  const [index, setIndex] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mcqSelection, setMcqSelection] = useState<string | null>(null);
  const [openAnswer, setOpenAnswer] = useState("");
  // Shared by mcq and open: both are graded the same way now — a call to
  // the server, which is the sole source of truth for correct/suggestedRating.
  const [grade, setGrade] = useState<GradeResult | null>(null);
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState(false);

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
      setMcqSelection(null);
      setOpenAnswer("");
      setGrade(null);
      setGradeError(false);
      setStartedAt(Date.now());
    } finally {
      setSubmitting(false);
    }
  }

  // The server grades the option, not the client (source of truth for the
  // rating): a client-computed verdict is trivially forgeable and can
  // diverge from the server's own record of the card's answer.
  async function selectMcqOption(card: DueCard, option: string) {
    if (submitting || grading || mcqSelection !== null) return;
    setMcqSelection(option);
    setGrading(true);
    setGradeError(false);
    try {
      setGrade(await gradeAnswer(card.cardId, option));
    } catch {
      setGradeError(true);
      setMcqSelection(null); // let the user retry
    } finally {
      setGrading(false);
    }
  }

  async function submitOpenAnswer(card: DueCard) {
    if (grading || !openAnswer.trim()) return;
    setGrading(true);
    setGradeError(false);
    try {
      setGrade(await gradeAnswer(card.cardId, openAnswer));
    } catch {
      setGradeError(true);
    } finally {
      setGrading(false);
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
  const nextDueNote = nextDueDateMessage(progressQuery.data?.nextDueDate);

  if (cards.length === 0) {
    return (
      <main className="flex flex-col items-center gap-4 p-8 text-center">
        <Sleeping />
        <h1 className="font-[var(--font-display)] text-2xl font-extrabold">Révision</h1>
        <p>Tout est à jour.</p>
        {nextDueNote && <p className="text-sm text-text-muted">{nextDueNote}</p>}
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
        {nextDueNote && <p className="text-sm text-text-muted">{nextDueNote}</p>}
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
        {current.type === "flashcard" && revealed && <p className="text-lg text-primary">{current.answer}</p>}
        {current.type === "open" && grade && <p className="text-lg text-primary">{current.answer}</p>}
        {current.state === "stale" && <p className="text-xs text-text-muted">Cette fiche peut être obsolète, la notion a changé.</p>}
      </Card>

      {current.type === "flashcard" &&
        (!revealed ? (
          <Button onClick={() => setRevealed(true)}>Révéler la réponse</Button>
        ) : (
          <div className="flex gap-2">
            {([1, 2, 3, 4] as Rating[]).map((rating) => (
              <Button key={rating} variant="secondary" disabled={submitting} onClick={() => void rate(current, rating)}>
                {RATING_LABEL[rating]}
              </Button>
            ))}
          </div>
        ))}

      {current.type === "mcq" && current.options && (
        <div className="flex w-full max-w-md flex-col gap-2">
          {current.options.map((option) => {
            const chosen = mcqSelection !== null;
            // Reveal only once the server has actually graded the answer —
            // never before, so the highlight can never race ahead of it.
            const revealCorrectOption = grade !== null && isCorrectOption(option, current.answer);
            const isSelected = mcqSelection === option;
            const wrongPick = !revealCorrectOption && chosen && isSelected && grade !== null;
            const outcomeClass = revealCorrectOption ? "ring-2 ring-success" : wrongPick ? "ring-2 ring-accent" : "";
            return (
              <Button
                key={option}
                variant="secondary"
                disabled={chosen}
                className={outcomeClass}
                onClick={() => void selectMcqOption(current, option)}
              >
                {/* Colour alone doesn't distinguish these two facts
                    reliably (docs/UI.md's Colour note): the icon carries
                    the distinction visually, an sr-only span carries it
                    for assistive tech, since nothing else on screen names
                    which specific option is which. */}
                {revealCorrectOption && (
                  <>
                    <Check aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
                    <span className="sr-only">Bonne réponse.</span>
                  </>
                )}
                {wrongPick && (
                  <>
                    <X aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
                    <span className="sr-only">Ta réponse.</span>
                  </>
                )}
                {option}
              </Button>
            );
          })}
          {mcqSelection !== null && grading && (
            <p aria-live="polite" className="text-sm text-text-muted">
              Correction en cours…
            </p>
          )}
          {gradeError && <p role="alert">Impossible de corriger ta réponse. Vérifie ta connexion et réessaie.</p>}
          {grade && (
            <>
              <p className="text-sm text-text-muted">{grade.feedback}</p>
              <Button variant="accent" disabled={submitting} onClick={() => void rate(current, grade.suggestedRating)}>
                Continuer
              </Button>
            </>
          )}
        </div>
      )}

      {current.type === "open" &&
        (!grade ? (
          <div className="flex w-full max-w-md flex-col gap-3">
            <label htmlFor="open-answer" className="text-sm text-text-muted">
              Ta réponse
            </label>
            <textarea
              id="open-answer"
              className="min-h-24 rounded-[var(--radius-button)] border border-border bg-surface p-3 text-text"
              value={openAnswer}
              onChange={(event) => setOpenAnswer(event.target.value)}
            />
            {gradeError && <p role="alert">Impossible de corriger ta réponse. Vérifie ta connexion et réessaie.</p>}
            <Button disabled={grading || !openAnswer.trim()} onClick={() => void submitOpenAnswer(current)}>
              {grading ? "Correction en cours…" : "Valider ma réponse"}
            </Button>
          </div>
        ) : (
          <div className="flex w-full max-w-md flex-col gap-3">
            <p className="text-sm text-text-muted">
              {grade.correct ? "Correct." : "Incorrect."} {grade.feedback}
            </p>
            <div className="flex gap-2">
              {([1, 2, 3, 4] as Rating[]).map((rating) => (
                <Button
                  key={rating}
                  variant={rating === grade.suggestedRating ? "accent" : "secondary"}
                  disabled={submitting}
                  onClick={() => void rate(current, rating)}
                >
                  {RATING_LABEL[rating]}
                </Button>
              ))}
            </div>
          </div>
        ))}
    </main>
  );
}
