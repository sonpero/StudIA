import type { DocumentSummary } from "@studia/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Confused } from "../components/mascot/Confused.js";
import { Sleeping } from "../components/mascot/Sleeping.js";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { listDocuments } from "../lib/documents-api.js";
import { uploadTodoPhoto } from "../lib/proposals-api.js";
import { createTodo, getToday, toggleTodo, type TodayView } from "../lib/today-api.js";

const QUERY_KEY = ["today"];
const DOCUMENTS_QUERY_KEY = ["documents"];

// One card per course, never split by kind (docs/UI.md's Aujourd'hui note):
// TodayView still carries dueCards/notionsBelowTarget/upcomingDeadlines as
// three independent, documentId-keyed arrays (workspace's own shape,
// unchanged), this just folds them into one row per course in memory. A
// course absent from all three contributes no card at all — this screen
// answers "what do I do now", not "what are all my courses".
type CourseCard = {
  documentId: string;
  documentTitle: string;
  colour: string | null;
  dueCount: number;
  belowTargetCount: number;
  deadline: { label: string | null; daysAway: number } | null;
};

function buildCourseCards(view: TodayView): CourseCard[] {
  const byId = new Map<string, CourseCard>();

  function ensure(documentId: string, documentTitle: string, colour: string | null): CourseCard {
    const existing = byId.get(documentId);
    if (existing) return existing;
    const card: CourseCard = { documentId, documentTitle, colour, dueCount: 0, belowTargetCount: 0, deadline: null };
    byId.set(documentId, card);
    return card;
  }

  for (const entry of view.dueCards) {
    ensure(entry.documentId, entry.documentTitle, entry.colour).dueCount = entry.count;
  }
  for (const entry of view.notionsBelowTarget) {
    ensure(entry.documentId, entry.documentTitle, entry.colour).belowTargetCount = entry.count;
  }
  for (const entry of view.upcomingDeadlines) {
    // upcomingDeadlines carries no colour (workspace.md): a course reaching
    // this screen only through its deadline renders without a colour dot
    // rather than guessing one.
    ensure(entry.documentId, entry.title, null).deadline = { label: entry.deadlineLabel, daysAway: entry.daysAway };
  }

  return [...byId.values()];
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
      <input
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={uploading}
        onChange={(e) => void handleChange(e.target.files?.[0])}
        className="rounded-[var(--radius-button)] border border-border bg-surface p-2 text-sm disabled:opacity-50"
      />
      {error && (
        <p role="alert" className="text-sm text-warning">
          {error}
        </p>
      )}
    </div>
  );
}

// Strictly what the CRUD already exposes server-side: a label, an optional
// date, an optional course — no priority, no tags, no recurrence.
function AddTodoForm({ documents, pending, onSubmit }: { documents: DocumentSummary[]; pending: boolean; onSubmit: (input: { label: string; dueDate: string | null; documentId: string | null }) => void }) {
  const [label, setLabel] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [documentId, setDocumentId] = useState("");
  const labelId = useId();
  const dateId = useId();
  const courseId = useId();

  return (
    <form
      className="flex flex-col gap-2 rounded-[var(--radius-button)] bg-canvas p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = label.trim();
        if (!trimmed) return;
        onSubmit({ label: trimmed, dueDate: dueDate || null, documentId: documentId || null });
        setLabel("");
        setDueDate("");
        setDocumentId("");
      }}
    >
      <label htmlFor={labelId} className="flex flex-col gap-1 text-sm text-text-muted">
        Nouveau todo
        <input
          id={labelId}
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="rounded-[var(--radius-button)] border border-border bg-surface p-2 text-text"
          placeholder="Réviser le chapitre 3"
        />
      </label>
      <label htmlFor={dateId} className="flex flex-col gap-1 text-sm text-text-muted">
        Date (facultatif)
        <input id={dateId} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="rounded-[var(--radius-button)] border border-border bg-surface p-2 text-text" />
      </label>
      <label htmlFor={courseId} className="flex flex-col gap-1 text-sm text-text-muted">
        Cours (facultatif)
        <select id={courseId} value={documentId} onChange={(e) => setDocumentId(e.target.value)} className="rounded-[var(--radius-button)] border border-border bg-surface p-2 text-text">
          <option value="">Aucun</option>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" variant="secondary" disabled={pending || !label.trim()} className="self-start">
        {pending ? "Ajout…" : "Ajouter"}
      </Button>
    </form>
  );
}

function CourseTodayCard({ card, onOpenCourse, onReviewCourse }: { card: CourseCard; onOpenCourse: (documentId: string) => void; onReviewCourse: (documentId: string) => void }) {
  return (
    <Card className="flex flex-col gap-3" data-testid="course-today-card">
      <div className="flex items-center gap-2">
        {card.colour && <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ backgroundColor: card.colour }} />}
        <h3 className="font-[var(--font-display)] text-base font-extrabold">{card.documentTitle}</h3>
      </div>

      <div className="flex flex-col gap-1 text-sm text-text-muted">
        {card.dueCount > 0 && (
          <p>
            {card.dueCount} fiche{card.dueCount > 1 ? "s" : ""} à revoir aujourd'hui
          </p>
        )}
        {card.belowTargetCount > 0 && (
          <p>
            {card.belowTargetCount} notion{card.belowTargetCount > 1 ? "s" : ""} à consolider avant l'échéance
          </p>
        )}
        {card.deadline && (
          <p>
            {card.deadline.label ? `${card.deadline.label}, ` : ""}
            dans {card.deadline.daysAway} jour{card.deadline.daysAway > 1 ? "s" : ""}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => onOpenCourse(card.documentId)}>
          Voir le cours
        </Button>
        {card.dueCount > 0 && (
          <Button variant="secondary" onClick={() => onReviewCourse(card.documentId)}>
            Réviser
          </Button>
        )}
      </div>
    </Card>
  );
}

export function TodayScreen({
  onOpenProposals,
  onOpenCourse,
  onReviewCourse,
}: {
  onOpenProposals: (jobId: string) => void;
  onOpenCourse: (documentId: string) => void;
  onReviewCourse: (documentId: string) => void;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: getToday });
  // Only feeds the manual-add form's optional course picker: a course with
  // nothing to signal today never reaches TodayView (see buildCourseCards),
  // but it must still be selectable when adding a todo by hand.
  const documentsQuery = useQuery({ queryKey: DOCUMENTS_QUERY_KEY, queryFn: listDocuments });
  const toggleMutation = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => toggleTodo(id, done),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
  const createTodoMutation = useMutation({
    mutationFn: createTodo,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  if (query.status === "pending") {
    return (
      <main className="flex flex-col gap-4 p-8">
        <h1 className="font-[var(--font-display)] text-2xl font-extrabold">Aujourd'hui</h1>
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
  const courseCards = buildCourseCards(view);
  const nothingAtAll = courseCards.length === 0 && view.todos.length === 0;

  return (
    <main className="flex flex-col gap-6 p-8">
      <h1 className="font-[var(--font-display)] text-2xl font-extrabold">Aujourd'hui</h1>

      {nothingAtAll ? (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <Sleeping />
          <p>Rien de prévu pour l'instant. Profites-en pour prendre un cours en photo.</p>
        </div>
      ) : (
        courseCards.length > 0 && (
          <section className="flex flex-col gap-3">
            {courseCards.map((card) => (
              <CourseTodayCard key={card.documentId} card={card} onOpenCourse={onOpenCourse} onReviewCourse={onReviewCourse} />
            ))}
          </section>
        )
      )}

      <section className="flex flex-col gap-3">
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
        <AddTodoForm documents={documentsQuery.data ?? []} pending={createTodoMutation.isPending} onSubmit={(input) => createTodoMutation.mutate(input)} />
        <PhotoUploadInput onUploaded={onOpenProposals} />
      </section>
    </main>
  );
}
