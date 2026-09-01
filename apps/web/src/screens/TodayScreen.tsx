import type { DocumentSummary } from "@studia/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Repeat } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Confused } from "../components/mascot/Confused.js";
import { Sleeping } from "../components/mascot/Sleeping.js";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { listDocuments } from "../lib/documents-api.js";
import { ICON_SIZE_INLINE, ICON_STROKE_WIDTH } from "../lib/icons.js";
import { uploadTodoPhoto } from "../lib/proposals-api.js";
import { createTodo, deleteTodo, getToday, toggleTodo, type TodayView } from "../lib/today-api.js";

// A design-system chevron replacing <select>'s native arrow (--color-text-muted,
// #667085, matched by hand — tokens.css's @theme values aren't reachable from
// a plain string literal). appearance-none removes the browser's own arrow;
// this is its token-coloured replacement, not a decoration on top of it.
const SELECT_CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%23667085'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E\")";

// Shared by every field in AddTodoForm. appearance-none plus the two
// [&::-webkit-calendar-picker-indicator] rules are what actually stop the
// date field from reading as an unstyled native control (docs/UI.md's
// Shape and depth) — width alone, tried in the previous pass, did not.
const FIELD_CLASS =
  "w-full appearance-none rounded-[var(--radius-button)] border border-border bg-surface p-2 text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60";

const QUERY_KEY = ["today"];
const DOCUMENTS_QUERY_KEY = ["documents"];

// A todo's due date is a plain dated fact, formatted the same way whether
// it's still to come or already past (docs/UI.md — no countdown, no
// --warning colour marking it overdue). dueDate is a bare "YYYY-MM-DD" key
// (workspace's own shape, same as the calendar's day keys): parsed through
// local-time Date components, never `new Date(dueDate)` directly, so the
// displayed day never shifts by one under a non-UTC timezone.
const TODO_DUE_DATE_FORMATTER = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

function formatTodoDueDate(dueDate: string): string {
  const year = Number(dueDate.slice(0, 4));
  const month = Number(dueDate.slice(5, 7));
  const day = Number(dueDate.slice(8, 10));
  return TODO_DUE_DATE_FORMATTER.format(new Date(year, month - 1, day));
}

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

  // Sorted by urgency, nearest deadline first (docs/UI.md's Aujourd'hui
  // note): a course with no deadline compares as Infinity, so it always
  // sorts after every course that has one. Array.prototype.sort's own
  // guaranteed stability (ES2019+) keeps ties — including "no deadline at
  // all" ties — in the order this Map already produced, with no separate
  // tie-break key needed.
  return [...byId.values()].sort((a, b) => (a.deadline?.daysAway ?? Infinity) - (b.deadline?.daysAway ?? Infinity));
}

function TodoRow({ todo, onToggle, onDelete }: { todo: TodayView["todos"][number]; onToggle: (done: boolean) => void; onDelete: () => void }) {
  return (
    <li className="flex items-center gap-2" data-testid="todo-row">
      <input type="checkbox" checked={todo.done} onChange={(e) => onToggle(e.target.checked)} aria-label={todo.label} />
      <span className={todo.done ? "flex-1 line-through text-text-muted" : "flex-1 text-text"}>{todo.label}</span>
      {todo.dueDate && <span className="text-xs text-text-muted">{formatTodoDueDate(todo.dueDate)}</span>}
      {/* Same idiom as UploadCard's own staged-file removal: an accessible
          label naming the item, not a bare icon (docs/UI.md's Forbidden
          list). No confirmation — a todo is low stakes and trivially re-added. */}
      <button type="button" aria-label={`Supprimer « ${todo.label} »`} onClick={onDelete} className="text-text-muted hover:text-text">
        ✕
      </button>
    </li>
  );
}

// Reused in both the empty and ready states: the only way in this screen to
// reach the photo-extraction flow (docs/modules/workspace.md's step 3).
// Closable without picking a file — Escape or the visible "Fermer" button
// do the same thing, disabled while a photo is already uploading, the same
// guard UploadCard's own "Annuler" applies to its confirm step (docs/UI.md's
// Shape and depth note).
function PhotoUploadInput({ onUploaded, onClose }: { onUploaded: (jobId: string) => void; onClose: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Same convention as AddTodoForm's own label field: opening this puts
  // focus inside it. Also what makes Escape reach the onKeyDown handler
  // below at all — the trigger button that opened this unmounts on click,
  // so without this, focus would fall back to the page body, outside this
  // component entirely, and a keydown there would never bubble through it.
  useEffect(() => {
    fileInputRef.current?.focus();
  }, []);

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
    <div
      className="flex flex-col gap-1"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !uploading) onClose();
      }}
    >
      <label htmlFor={inputId} className="text-sm font-medium">
        Photo de l'agenda
      </label>
      <input
        id={inputId}
        ref={fileInputRef}
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
      <Button type="button" variant="secondary" disabled={uploading} onClick={onClose} className="self-start">
        Fermer
      </Button>
    </div>
  );
}

type TodoDraft = { label: string; dueDate: string; documentId: string };
const EMPTY_TODO_DRAFT: TodoDraft = { label: "", dueDate: "", documentId: "" };

// Strictly what the CRUD already exposes server-side: a label, an optional
// date, an optional course — no priority, no tags, no recurrence.
//
// The draft lives in the parent (TodosCard), not as local state here:
// this form unmounts on close (it's a sibling of its own "Ajouter un todo"
// trigger, not CSS-hidden — docs/UI.md), so an unsaved draft only survives
// Escape because it was never inside the component that just disappeared.
function AddTodoForm({
  documents,
  pending,
  draft,
  onDraftChange,
  onSubmit,
  onClose,
}: {
  documents: DocumentSummary[];
  pending: boolean;
  draft: TodoDraft;
  onDraftChange: (draft: TodoDraft) => void;
  onSubmit: (input: { label: string; dueDate: string | null; documentId: string | null }) => void;
  onClose: () => void;
}) {
  const labelRef = useRef<HTMLInputElement>(null);
  const labelId = useId();
  const dateId = useId();
  const courseId = useId();

  // Runs once per mount, i.e. once per open (docs/UI.md: opening the form
  // puts focus on the label field).
  useEffect(() => {
    labelRef.current?.focus();
  }, []);

  return (
    <form
      className="flex flex-col gap-2 rounded-[var(--radius-button)] bg-canvas p-3"
      onKeyDown={(e) => {
        // Whether there's a draft to keep or not, Escape only ever closes
        // — it never clears `draft`, so a non-empty label survives to the
        // next open on its own; an empty one has nothing to survive. Same
        // guard as the visible "Fermer" button below: neither closes
        // mid-submit.
        if (e.key === "Escape" && !pending) onClose();
      }}
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = draft.label.trim();
        if (!trimmed) return;
        onSubmit({ label: trimmed, dueDate: draft.dueDate || null, documentId: draft.documentId || null });
        onDraftChange(EMPTY_TODO_DRAFT);
        onClose();
      }}
    >
      <label htmlFor={labelId} className="flex flex-col gap-1 text-sm text-text-muted">
        Nouveau todo
        <input
          id={labelId}
          ref={labelRef}
          required
          value={draft.label}
          onChange={(e) => onDraftChange({ ...draft, label: e.target.value })}
          className={FIELD_CLASS}
          placeholder="Réviser le chapitre 3"
        />
      </label>
      <label htmlFor={dateId} className="flex flex-col gap-1 text-sm text-text-muted">
        Date (facultatif)
        <input id={dateId} type="date" value={draft.dueDate} onChange={(e) => onDraftChange({ ...draft, dueDate: e.target.value })} className={FIELD_CLASS} />
      </label>
      <label htmlFor={courseId} className="flex flex-col gap-1 text-sm text-text-muted">
        Cours (facultatif)
        <select
          id={courseId}
          value={draft.documentId}
          onChange={(e) => onDraftChange({ ...draft, documentId: e.target.value })}
          className={`${FIELD_CLASS} bg-no-repeat pr-8`}
          style={{ backgroundImage: SELECT_CHEVRON, backgroundPosition: "right 0.6rem center", backgroundSize: "1rem" }}
        >
          <option value="">Aucun</option>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <Button type="submit" variant="secondary" disabled={pending || !draft.label.trim()}>
          {pending ? "Ajout…" : "Ajouter"}
        </Button>
        {/* Closes without discarding the draft (docs/UI.md's Shape and
            depth note) — not "Annuler", which elsewhere in this app means
            the revealed area's own state does not survive closing; this
            one's draft lives in the parent and is still there next open. */}
        <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
          Fermer
        </Button>
      </div>
    </form>
  );
}

function CourseTodayCard({ card, onOpenCourse, onReviewCourse }: { card: CourseCard; onOpenCourse: (documentId: string) => void; onReviewCourse: (documentId: string) => void }) {
  return (
    <Card
      className={`flex flex-col gap-3 ${card.colour ? "border-l-4" : ""}`}
      style={card.colour ? { borderLeftColor: card.colour } : undefined}
      data-testid="course-today-card"
    >
      <h3 className="font-[family-name:var(--font-display)] text-[length:var(--text-title)] font-extrabold">{card.documentTitle}</h3>

      <div className="flex flex-col gap-1">
        {/* At most one --text-display digit per card (docs/UI.md's Type
            note): the due count wins the display slot whenever it's
            present, since "Réviser" — this card's own accent action —
            acts on it directly. The below-target count only demotes to
            the plain-fact register when the due count is also there to
            contest it; alone, it keeps --text-display exactly as before —
            nothing to resolve a conflict against (docs/UI.md's Aujourd'hui
            note). */}
        {card.dueCount > 0 && (
          <p>
            <span className="font-[family-name:var(--font-display)] text-[length:var(--text-display)] font-extrabold tabular-nums text-text">{card.dueCount}</span>{" "}
            <span className="text-[length:var(--text-label)] text-text-muted">
              fiche{card.dueCount > 1 ? "s" : ""} à revoir aujourd'hui
            </span>
          </p>
        )}
        {card.belowTargetCount > 0 && card.dueCount === 0 && (
          <p>
            <span className="font-[family-name:var(--font-display)] text-[length:var(--text-display)] font-extrabold tabular-nums text-text">{card.belowTargetCount}</span>{" "}
            <span className="text-[length:var(--text-label)] text-text-muted">
              notion{card.belowTargetCount > 1 ? "s" : ""} à consolider avant l'échéance
            </span>
          </p>
        )}
        {card.belowTargetCount > 0 && card.dueCount > 0 && (
          <p className="text-sm text-text-muted">
            {card.belowTargetCount} notion{card.belowTargetCount > 1 ? "s" : ""} à consolider avant l'échéance
          </p>
        )}
        {card.deadline && (
          <p className="text-sm text-text-muted">
            {card.deadline.label ? `${card.deadline.label}, ` : ""}
            dans {card.deadline.daysAway} jour{card.deadline.daysAway > 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* mt-auto pushes this row to the card's own bottom edge (docs/UI.md's
          Grid and spacing note): once items-stretch (below) makes this card
          as tall as its row's tallest neighbour, the extra height lands here,
          above the buttons, rather than leaving them floating over a gap
          beneath. */}
      <div className="mt-auto flex gap-2">
        <Button variant="secondary" onClick={() => onOpenCourse(card.documentId)}>
          <BookOpen aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
          Voir le cours
        </Button>
        {card.dueCount > 0 && (
          <Button variant="accent" onClick={() => onReviewCourse(card.documentId)}>
            <Repeat aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
            Réviser
          </Button>
        )}
      </div>
    </Card>
  );
}

// One Card, not three loose pieces (docs/UI.md): the checklist, the add
// form and the photo picker are one unit for layout purposes, so the grid
// above lays out one item here, not three independently-sized ones.
function TodosCard({
  todos,
  documents,
  createPending,
  onToggle,
  onDelete,
  onCreate,
  onPhotoUploaded,
}: {
  todos: TodayView["todos"];
  documents: DocumentSummary[];
  createPending: boolean;
  onToggle: (id: string, done: boolean) => void;
  onDelete: (id: string) => void;
  onCreate: (input: { label: string; dueDate: string | null; documentId: string | null }) => void;
  onPhotoUploaded: (jobId: string) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<TodoDraft>(EMPTY_TODO_DRAFT);
  const [photoOpen, setPhotoOpen] = useState(false);

  return (
    <Card className="flex flex-col gap-3" data-testid="todos-card">
      <h2 className="text-[length:var(--text-label)] font-medium text-text-muted">Todos</h2>
      {todos.length > 0 && (
        // A bounded, scrollable panel (docs/UI.md's Shape and depth note):
        // caps only the list, roughly five rows tall, never the card around
        // it. 13rem is deliberately not a clean multiple of one row's own
        // rendered height (a round max-h-60/15rem was tried first and
        // measured live: it landed exactly on a row boundary, six full rows
        // and no visible cut at all) — this value was tuned against the
        // real rendered row height so a partial row shows at the boundary
        // once there is more to see, never a fade gradient, never a "+N"
        // count, so nothing readable ever silently disappears. Every row
        // stays mounted regardless (no virtualisation): Tab still reaches
        // all of them, the browser's own native scroll-into-view carries a
        // keyboard user past the fold, and nothing here is lazily loaded —
        // this is not the infinite scroll the Forbidden list bans. Rows are
        // --space-block apart (docs/UI.md's Aujourd'hui note: "rows in a
        // list"), not the tighter --space-related a checkbox shares with
        // its own label inside one row.
        <ul className="flex max-h-[13rem] flex-col gap-[var(--space-block)] overflow-y-auto">
          {todos.map((todo) => (
            <TodoRow key={todo.id} todo={todo} onToggle={(done) => onToggle(todo.id, done)} onDelete={() => onDelete(todo.id)} />
          ))}
        </ul>
      )}

      {/* Collapsed by default (docs/UI.md): a permanently open form was, on
          its own, wider and taller than the list it sat below. While both
          triggers are still collapsed, they share one width (docs/UI.md's
          Shape and depth note): a single-column inline-grid, self-start so
          the wrapper itself hugs its own content instead of stretching to
          the card's full width the way Card's own flex-col would otherwise
          give it by default, and the grid's own default stretch then makes
          the narrower button match the wider one. The moment either opens,
          this reverts to a plain stack — an open form is meant to take the
          card's full width already (Shape and depth's own form-width rule),
          and the other trigger, if still collapsed, goes back to its own
          natural size rather than being stretched to match a form. */}
      <div className={addOpen || photoOpen ? "flex flex-col gap-3" : "inline-grid grid-cols-1 gap-3 self-start"}>
        {addOpen ? (
          <AddTodoForm
            documents={documents}
            pending={createPending}
            draft={draft}
            onDraftChange={setDraft}
            onSubmit={onCreate}
            onClose={() => setAddOpen(false)}
          />
        ) : (
          <Button type="button" variant="secondary" onClick={() => setAddOpen(true)}>
            Ajouter un todo
          </Button>
        )}

        {photoOpen ? (
          <PhotoUploadInput onUploaded={onPhotoUploaded} onClose={() => setPhotoOpen(false)} />
        ) : (
          <Button type="button" variant="secondary" onClick={() => setPhotoOpen(true)}>
            Ajouter depuis une photo
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
  const deleteTodoMutation = useMutation({
    mutationFn: deleteTodo,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  if (query.status === "pending") {
    return (
      <main className="flex flex-col gap-[var(--space-section)] p-8">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Aujourd'hui</h1>
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
      <main className="flex flex-col items-center gap-[var(--space-section)] p-8 text-center">
        <Confused />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Aujourd'hui</h1>
        <p>Impossible de charger ta journée. Vérifie ta connexion et réessaie.</p>
        <Button onClick={() => void query.refetch()}>Réessayer</Button>
      </main>
    );
  }

  const view = query.data;
  const courseCards = buildCourseCards(view);
  const nothingAtAll = courseCards.length === 0 && view.todos.length === 0;

  return (
    <main className="flex flex-col gap-[var(--space-section)] p-8">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Aujourd'hui</h1>

      {nothingAtAll && (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <Sleeping />
          <p>Rien de prévu pour l'instant. Profites-en pour prendre un cours en photo.</p>
        </div>
      )}

      {/* One grid, not two (docs/UI.md): course cards and the todos card
          are items in the same grid, sharing its gutters — items-stretch so
          every card in a row shares one height (each card pushes its own
          action row to the bottom with mt-auto instead). Always rendered,
          even when nothingAtAll: the todos card (add form, photo picker) is
          still how the empty state's "one useful suggestion" is actually
          acted on, not just illustrated. */}
      <div className="grid grid-cols-1 items-stretch gap-[var(--space-block)] lg:grid-cols-2" data-testid="content-grid">
        {courseCards.map((card) => (
          <CourseTodayCard key={card.documentId} card={card} onOpenCourse={onOpenCourse} onReviewCourse={onReviewCourse} />
        ))}
        <TodosCard
          todos={view.todos}
          documents={documentsQuery.data ?? []}
          createPending={createTodoMutation.isPending}
          onToggle={(id, done) => toggleMutation.mutate({ id, done })}
          onDelete={(id) => deleteTodoMutation.mutate(id)}
          onCreate={(input) => createTodoMutation.mutate(input)}
          onPhotoUploaded={onOpenProposals}
        />
      </div>
    </main>
  );
}
