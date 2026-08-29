import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Confused } from "../components/mascot/Confused.js";
import { Idle } from "../components/mascot/Idle.js";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { listNotions } from "../lib/notions-api.js";
import {
  deleteDeadline,
  getPlanForDocument,
  markDayCompleted,
  setAvailability,
  setDeadline,
  type Availability,
  type PlanDay,
  type ProgressInputErrorKind,
  type Weekday,
} from "../lib/progress-api.js";

const WEEKDAYS: { key: Weekday; label: string }[] = [
  { key: "mon", label: "Lun" },
  { key: "tue", label: "Mar" },
  { key: "wed", label: "Mer" },
  { key: "thu", label: "Jeu" },
  { key: "fri", label: "Ven" },
  { key: "sat", label: "Sam" },
  { key: "sun", label: "Dim" },
];

const DEFAULT_AVAILABILITY: Availability = { mon: 30, tue: 30, wed: 30, thu: 30, fri: 30, sat: 0, sun: 0 };

const dayFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
function formatDay(dateKey: string): string {
  return dayFormatter.format(new Date(`${dateKey}T00:00:00.000Z`));
}

// Known debt: docs/MILESTONES.md's M5 entry.
const INPUT_ERROR_MESSAGE: Record<ProgressInputErrorKind, string> = {
  "deadline-in-past": "Cette échéance est déjà passée. Choisis une date à venir.",
  "no-capacity": "Indique combien de temps tu peux consacrer à ce cours chaque jour.",
  "no-usable-day": "Aucun jour disponible avant cette échéance. Recule-la ou ajoute de la disponibilité.",
};

export function ProgressScreen({ documentId, onBack }: { documentId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [deadlineDate, setDeadlineDate] = useState("");
  const [deadlineLabel, setDeadlineLabel] = useState("");
  const [availability, setAvailabilityInput] = useState<Availability>(DEFAULT_AVAILABILITY);

  const planQuery = useQuery({ queryKey: ["plan", documentId], queryFn: () => getPlanForDocument(documentId) });
  const notionsQuery = useQuery({ queryKey: ["notions", documentId], queryFn: () => listNotions(documentId) });

  const setDeadlineMutation = useMutation({
    mutationFn: () => setDeadline(documentId, deadlineDate, deadlineLabel.trim() || undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["plan", documentId] }),
  });
  const deleteDeadlineMutation = useMutation({
    mutationFn: () => deleteDeadline(documentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["plan", documentId] }),
  });
  const setAvailabilityMutation = useMutation({
    mutationFn: () => setAvailability(availability),
    // Availability is user-level, not per document: every document's plan
    // may change, so every ["plan", ...] query is invalidated, not just this one.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["plan"] }),
  });
  const markCompletedMutation = useMutation({ mutationFn: (date: string) => markDayCompleted(date) });

  if (planQuery.status === "pending") {
    return (
      <main className="flex flex-col items-center gap-4 p-8">
        <h1 className="font-[var(--font-display)] text-2xl font-extrabold">Planning</h1>
        <div className="h-48 w-full max-w-md animate-pulse rounded-[var(--radius-card)] bg-border" />
      </main>
    );
  }

  if (planQuery.status === "error") {
    return (
      <main className="flex flex-col items-center gap-4 p-8 text-center">
        <Confused />
        <h1 className="font-[var(--font-display)] text-2xl font-extrabold">Planning</h1>
        <p>Impossible de charger le plan. Vérifie ta connexion et réessaie.</p>
        <Button onClick={() => void planQuery.refetch()}>Réessayer</Button>
      </main>
    );
  }

  const result = planQuery.data;
  const notionTitleById = new Map((notionsQuery.data ?? []).map((n) => [n.id, n.title]));

  const availabilityForm = (
    <Card className="flex w-full max-w-md flex-col gap-3 p-6">
      <h2 className="font-medium">Tes disponibilités</h2>
      <p className="text-sm text-text-muted">Combien de minutes par jour peux-tu consacrer à ce cours ?</p>
      <div className="grid grid-cols-7 gap-2">
        {WEEKDAYS.map(({ key, label }) => (
          <label key={key} className="flex flex-col items-center gap-1 text-xs text-text-muted">
            {label}
            <input
              type="number"
              min={0}
              aria-label={label}
              className="w-full rounded-[var(--radius-button)] border border-border bg-surface p-1 text-center text-text"
              value={availability[key]}
              onChange={(event) => setAvailabilityInput((current) => ({ ...current, [key]: Math.max(0, Number(event.target.value) || 0) }))}
            />
          </label>
        ))}
      </div>
      <Button disabled={setAvailabilityMutation.isPending} onClick={() => setAvailabilityMutation.mutate()}>
        {setAvailabilityMutation.isPending ? "Enregistrement…" : "Enregistrer mes disponibilités"}
      </Button>
    </Card>
  );

  const deadlineForm = (
    <Card className="flex w-full max-w-md flex-col gap-3 p-6">
      <h2 className="font-medium">Échéance</h2>
      <label className="flex flex-col gap-1 text-sm text-text-muted">
        Date
        <input
          type="date"
          className="rounded-[var(--radius-button)] border border-border bg-surface p-2 text-text"
          value={deadlineDate}
          onChange={(event) => setDeadlineDate(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-text-muted">
        Intitulé (facultatif)
        <input
          type="text"
          placeholder="Contrôle de maths"
          className="rounded-[var(--radius-button)] border border-border bg-surface p-2 text-text"
          value={deadlineLabel}
          onChange={(event) => setDeadlineLabel(event.target.value)}
        />
      </label>
      <Button disabled={!deadlineDate || setDeadlineMutation.isPending} onClick={() => setDeadlineMutation.mutate()}>
        {setDeadlineMutation.isPending ? "Enregistrement…" : "Définir l'échéance"}
      </Button>
    </Card>
  );

  return (
    <main className="flex flex-col items-center gap-6 p-8">
      <div className="flex w-full max-w-md items-center justify-between">
        <h1 className="font-[var(--font-display)] text-2xl font-extrabold">Planning</h1>
        <button type="button" className="text-sm text-text-muted underline" onClick={onBack}>
          Retour
        </button>
      </div>

      {result.kind === "input-error" ? (
        <>
          <Idle />
          <p className="text-center">{INPUT_ERROR_MESSAGE[result.error]}</p>
          {result.error === "no-capacity" ? availabilityForm : deadlineForm}
        </>
      ) : (
        <>
          {!result.plan.feasible && (
            <p className="w-full max-w-md rounded-[var(--radius-card)] border border-warning bg-warning/10 p-3 text-sm text-warning">
              Il manque environ {result.plan.shortfallMinutes} minutes de travail avant l'échéance. Ajoute des jours ou réduis le nombre de fiches à réviser.
            </p>
          )}

          {result.plan.days.length === 0 ? (
            <>
              <Idle />
              <p>Rien à planifier pour l'instant.</p>
            </>
          ) : (
            <div className="flex w-full max-w-md flex-col gap-3">
              {result.plan.days.map((day) => (
                <PlanDayCard key={day.date} day={day} notionTitleById={notionTitleById} onMarkCompleted={() => markCompletedMutation.mutate(day.date)} />
              ))}
            </div>
          )}

          <details className="w-full max-w-md">
            <summary className="cursor-pointer text-sm text-text-muted">Changer l'échéance ou mes disponibilités</summary>
            <div className="mt-3 flex flex-col gap-3">
              {deadlineForm}
              {availabilityForm}
              <Button variant="secondary" disabled={deleteDeadlineMutation.isPending} onClick={() => deleteDeadlineMutation.mutate()}>
                Supprimer l'échéance
              </Button>
            </div>
          </details>
        </>
      )}
    </main>
  );
}

function PlanDayCard({ day, notionTitleById, onMarkCompleted }: { day: PlanDay; notionTitleById: Map<string, string>; onMarkCompleted: () => void }) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between">
        <span className="font-medium capitalize">{formatDay(day.date)}</span>
        <span className="text-xs text-text-muted">{day.estimatedMinutes} min</span>
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {day.entries.map((entry, i) => (
          <li key={`${entry.notionId}-${entry.kind}-${i}`}>
            {entry.kind === "learn" ? "Apprentissage" : "Révision"} — {notionTitleById.get(entry.notionId) ?? entry.notionId}
          </li>
        ))}
      </ul>
      <Button variant="secondary" onClick={onMarkCompleted}>
        Marquer ce jour comme fait
      </Button>
    </Card>
  );
}
