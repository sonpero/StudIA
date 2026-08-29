import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Confused } from "../components/mascot/Confused.js";
import { Idle } from "../components/mascot/Idle.js";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { uploadTodoPhoto } from "../lib/proposals-api.js";
import { getToday, toggleTodo, type TodayView } from "../lib/today-api.js";

const QUERY_KEY = ["today"];

function isViewEmpty(view: TodayView): boolean {
  return view.dueCards.length === 0 && view.notionsBelowTarget.length === 0 && view.todos.length === 0 && view.upcomingDeadlines.length === 0;
}

// Neutral course-grouped counts (dueCards, notionsBelowTarget): same card
// shape for both, only the count's meaning differs.
function CourseCountCard({ documentTitle, count, unit }: { documentTitle: string; count: number; unit: string }) {
  return (
    <Card className="flex items-center justify-between gap-3" data-testid="course-count-card">
      <span className="font-[var(--font-display)] text-base font-extrabold">{documentTitle}</span>
      <span className="text-sm text-text-muted">
        {count} {unit}
        {count > 1 ? "s" : ""}
      </span>
    </Card>
  );
}

function TodoRow({ todo, onToggle }: { todo: TodayView["todos"][number]; onToggle: (done: boolean) => void }) {
  return (
    <li className="flex items-center gap-2" data-testid="todo-row">
      <input type="checkbox" checked={todo.done} onChange={(e) => onToggle(e.target.checked)} aria-label={todo.label} />
      <span className={todo.done ? "line-through text-text-muted" : "text-text"}>{todo.label}</span>
    </li>
  );
}

// Reused in both the empty and ready states: the only way in this screen to
// reach the photo-extraction flow (docs/modules/workspace.md's step 3).
function PhotoUploadInput({ onUploaded }: { onUploaded: (jobId: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  async function handleChange(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { jobId } = await uploadTodoPhoto(file);
      onUploaded(jobId);
    } catch {
      setError("Impossible d'envoyer la photo. Vérifie ta connexion et réessaie.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium">
        Ajouter des todos depuis une photo de l'agenda
      </label>
      <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(e) => void handleChange(e.target.files?.[0])} className="text-sm" />
      {error && (
        <p role="alert" className="text-sm text-warning">
          {error}
        </p>
      )}
    </div>
  );
}

export function TodayScreen({ onBack, onOpenProposals }: { onBack: () => void; onOpenProposals: (jobId: string) => void }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: getToday });
  const toggleMutation = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => toggleTodo(id, done),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  if (query.status === "pending") {
    return (
      <main className="flex flex-col gap-4 p-8">
        <div className="flex items-center justify-between">
          <h1 className="font-[var(--font-display)] text-2xl font-extrabold">Aujourd'hui</h1>
          <button type="button" className="text-sm text-text-muted underline" onClick={onBack}>
            Retour
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-[var(--radius-card)] bg-border" />
          ))}
        </div>
      </main>
    );
  }

  if (query.status === "error") {
    return (
      <main className="flex flex-col items-center gap-4 p-8 text-center">
        <Confused />
        <h1 className="font-[var(--font-display)] text-2xl font-extrabold">Aujourd'hui</h1>
        <p>Impossible de charger ta journée. Vérifie ta connexion et réessaie.</p>
        <Button onClick={() => void query.refetch()}>Réessayer</Button>
      </main>
    );
  }

  const view = query.data;

  if (isViewEmpty(view)) {
    return (
      <main className="flex flex-col items-center gap-4 p-8 text-center">
        <div className="flex w-full items-center justify-between">
          <div />
          <button type="button" className="text-sm text-text-muted underline" onClick={onBack}>
            Retour
          </button>
        </div>
        <Idle />
        <h1 className="font-[var(--font-display)] text-2xl font-extrabold">Aujourd'hui</h1>
        <p>Rien de prévu pour l'instant. Profites-en pour prendre un cours en photo.</p>
        <PhotoUploadInput onUploaded={onOpenProposals} />
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="font-[var(--font-display)] text-2xl font-extrabold">Aujourd'hui</h1>
        <button type="button" className="text-sm text-text-muted underline" onClick={onBack}>
          Retour
        </button>
      </div>

      {view.dueCards.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-text-muted">Fiches dues</h2>
          {view.dueCards.map((entry) => (
            <CourseCountCard key={entry.documentId} documentTitle={entry.documentTitle} count={entry.count} unit="fiche" />
          ))}
        </section>
      )}

      {view.notionsBelowTarget.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-text-muted">À consolider avant l'échéance</h2>
          {view.notionsBelowTarget.map((entry) => (
            <CourseCountCard key={entry.documentId} documentTitle={entry.documentTitle} count={entry.count} unit="notion" />
          ))}
        </section>
      )}

      {view.upcomingDeadlines.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-text-muted">Échéances à venir</h2>
          {view.upcomingDeadlines.map((entry) => (
            <Card key={entry.documentId} className="flex items-center justify-between gap-3">
              <span className="font-[var(--font-display)] text-base font-extrabold">{entry.title}</span>
              <span className="text-sm text-text-muted">
                {entry.deadlineLabel ? `${entry.deadlineLabel}, ` : ""}
                dans {entry.daysAway} jour{entry.daysAway > 1 ? "s" : ""}
              </span>
            </Card>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-text-muted">Todos</h2>
        {view.todos.length > 0 && (
          <Card>
            <ul className="flex flex-col gap-2">
              {view.todos.map((todo) => (
                <TodoRow key={todo.id} todo={todo} onToggle={(done) => toggleMutation.mutate({ id: todo.id, done })} />
              ))}
            </ul>
          </Card>
        )}
        <PhotoUploadInput onUploaded={onOpenProposals} />
      </section>
    </main>
  );
}
