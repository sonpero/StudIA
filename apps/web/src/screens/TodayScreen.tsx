import { useQuery } from "@tanstack/react-query";
import { Confused } from "../components/mascot/Confused.js";
import { Idle } from "../components/mascot/Idle.js";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { getToday, type TodayView } from "../lib/today-api.js";

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

// Read-only for now (docs/modules/workspace.md's step 1 CRUD exists at the
// API, but the creation/edit form and the checkbox interaction land with
// step 4's confirmation screen work) — no button, no checkbox here yet.
function TodoRow({ todo }: { todo: TodayView["todos"][number] }) {
  return (
    <li className={todo.done ? "line-through text-text-muted" : "text-text"} data-testid="todo-row">
      {todo.label}
    </li>
  );
}

export function TodayScreen({ onBack }: { onBack: () => void }) {
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: getToday });

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

      {view.todos.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-text-muted">Todos</h2>
          <Card>
            <ul className="flex flex-col gap-2">
              {view.todos.map((todo) => (
                <TodoRow key={todo.id} todo={todo} />
              ))}
            </ul>
          </Card>
        </section>
      )}
    </main>
  );
}
