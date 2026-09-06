import type { DocumentSummary } from "@studia/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  Camera,
  Check,
  Clock,
  ListChecks,
  Music,
  Play,
  Plus,
  RotateCcw,
  SkipBack,
  SkipForward,
  Timer,
  Volume2,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { FIELD_CLASS, SELECT_CHEVRON } from "../components/ui/field-styles.js";
import { listDocuments } from "../lib/documents-api.js";
import { ICON_SIZE_INLINE, ICON_STROKE_WIDTH } from "../lib/icons.js";
import { endPomodoro, getActivePomodoro, startPomodoro, type PomodoroSession } from "../lib/pomodoro-api.js";
import { uploadTodoPhoto } from "../lib/proposals-api.js";
import { createTodo, deleteTodo, getToday, toggleTodo, type TodayView, type Todo } from "../lib/today-api.js";

const QUERY_KEY = ["today"];
const DOCUMENTS_QUERY_KEY = ["documents"];
const POMODORO_ACTIVE_QUERY_KEY = ["pomodoro-active"];
// The backend's own pomodoro duration is fixed (packages/core/src/workspace),
// never selectable — hardcoded here rather than discovered, since there is
// no session yet to read a real durationSeconds from before one starts.
const IDLE_DISPLAY = "25:00";

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

// Same parsing convention as formatTodoDueDate above (local-time components,
// never `new Date(dateKey)` directly): view.date is workspace's own
// "YYYY-MM-DD" date key. French capitalises only the first word of a date,
// unlike the mockup's own English "Tuesday, May 18" — Intl gives
// "mardi 18 mai" for fr-FR, capitalised here to read as a line's own start.
const GREETING_DATE_FORMATTER = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });

function formatGreetingDate(dateKey: string): string {
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(5, 7));
  const day = Number(dateKey.slice(8, 10));
  const formatted = GREETING_DATE_FORMATTER.format(new Date(year, month - 1, day));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

// One card per course, never split by kind (docs/UI.md's Aujourd'hui note):
// TodayView still carries dueCards/notionsBelowTarget/upcomingDeadlines as
// three independent, documentId-keyed arrays (workspace's own shape,
// unchanged), this just folds them into one row per course in memory. A
// course absent from all three contributes no card at all — this screen
// answers "what do I do now", not "what are all my courses".
type CourseCardData = {
  documentId: string;
  documentTitle: string;
  colour: string | null;
  dueCount: number;
  belowTargetCount: number;
  // M9: only daysAway renders now, as the countdown badge below — the
  // absolute date and any custom label are dropped, not kept alongside it
  // (docs/UI.md's Aujourd'hui — deadline note), so there is nothing else
  // here to carry.
  deadline: { daysAway: number } | null;
};

// "Examen aujourd'hui"/"Examen demain" at 0/1, never "dans 0 jour"/"dans 1
// jour" (docs/UI.md's Aujourd'hui — deadline note). daysAway is always >= 0
// here: upcomingDeadlines already excludes a lapsed deadline.
export function countdownLabel(daysAway: number): string {
  if (daysAway === 0) return "Examen aujourd'hui";
  if (daysAway === 1) return "Examen demain";
  return `Examen dans ${daysAway} jours`;
}

function buildCourseCards(view: TodayView): CourseCardData[] {
  const byId = new Map<string, CourseCardData>();

  function ensure(documentId: string, documentTitle: string, colour: string | null): CourseCardData {
    const existing = byId.get(documentId);
    if (existing) return existing;
    const card: CourseCardData = { documentId, documentTitle, colour, dueCount: 0, belowTargetCount: 0, deadline: null };
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
    ensure(entry.documentId, entry.title, null).deadline = { daysAway: entry.daysAway };
  }

  // Sorted by urgency, nearest deadline first (docs/UI.md's Aujourd'hui
  // note): a course with no deadline compares as Infinity, so it always
  // sorts after every course that has one. Array.prototype.sort's own
  // guaranteed stability (ES2019+) keeps ties — including "no deadline at
  // all" ties — in the order this Map already produced, with no separate
  // tie-break key needed.
  return [...byId.values()].sort((a, b) => (a.deadline?.daysAway ?? Infinity) - (b.deadline?.daysAway ?? Infinity));
}

function remainingSeconds(session: PomodoroSession): number {
  const elapsed = Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000);
  return Math.max(0, session.durationSeconds - elapsed);
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
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
      <Button type="button" variant="secondary" disabled={uploading} onClick={onClose} className="self-start rounded-2xl">
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
        <Button type="submit" variant="secondary" className="rounded-2xl" disabled={pending || !draft.label.trim()}>
          {pending ? "Ajout…" : "Ajouter"}
        </Button>
        {/* Closes without discarding the draft (docs/UI.md's Shape and
            depth note) — not "Annuler", which elsewhere in this app means
            the revealed area's own state does not survive closing; this
            one's draft lives in the parent and is still there next open. */}
        <Button type="button" variant="secondary" className="rounded-2xl" disabled={pending} onClick={onClose}>
          Fermer
        </Button>
      </div>
    </form>
  );
}

// Knowingly departs from one of docs/UI.md's original rules for this screen,
// per the approved redesign mockup (docs/UI.md has not been reconciled with
// it yet — deferred, per the user, until later): the course card's subject
// icon sits in a tinted circle (a subject-colour tint), where docs/UI.md's
// original text calls for a left border only ("Card left border, not a
// tinted background").
function CourseCard({ course, onReviewCourse }: { course: CourseCardData; onReviewCourse?: (documentId: string) => void }) {
  const colour = course.colour ?? "#667085";
  return (
    <Card className="flex flex-col gap-[var(--space-block)]" data-testid="course-today-card">
      <div className="flex min-w-0 items-center gap-[var(--space-related)]">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${colour}26` }}>
          <BookOpen aria-hidden="true" focusable="false" size={24} strokeWidth={ICON_STROKE_WIDTH} color={colour} />
        </span>
        <span className="truncate font-[family-name:var(--font-display)] text-sm font-bold">{course.documentTitle}</span>
      </div>

      <div className="flex items-center justify-between gap-2">
        {course.dueCount > 0 ? (
          <p>
            <span className="font-[family-name:var(--font-display)] text-[length:var(--text-display)] font-extrabold tabular-nums" style={{ color: colour }}>
              {course.dueCount}
            </span>{" "}
            <span className="text-sm text-text-muted">fiche{course.dueCount > 1 ? "s" : ""} à revoir</span>
          </p>
        ) : (
          <p className="flex items-center gap-[var(--space-related)] text-sm font-semibold text-success">
            <Check aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
            Tout est à jour
          </p>
        )}
        {course.deadline && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[length:var(--text-label)] font-semibold whitespace-nowrap text-warning">
            <Clock aria-hidden="true" focusable="false" size={12} strokeWidth={ICON_STROKE_WIDTH} />
            {countdownLabel(course.deadline.daysAway)}
          </span>
        )}
      </div>

      {course.dueCount > 0 ? (
        <Button variant="accent" className="w-full justify-center rounded-2xl" onClick={() => onReviewCourse?.(course.documentId)}>
          Réviser
          <ArrowRight aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
        </Button>
      ) : (
        <Button variant="secondary" disabled className="w-full justify-center rounded-2xl">
          Rien à réviser
        </Button>
      )}
    </Card>
  );
}

// A plain white ring when unchecked, a filled green circle with a white
// checkmark once done — the mockup's own round todo bullets, in place of
// the browser's native square checkbox. Still a real <input type="checkbox">
// under the styling (appearance-none only strips its default paint, not its
// role/keyboard behaviour), so it stays a checkbox for assistive tech and
// for existing getByRole("checkbox") queries; the checkmark itself is a
// small inline SVG data URI, swapped in only once checked, since a native
// checkbox has no child elements to render one into.
const CHECK_MARK_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='5 13 10 18 19 7'/%3E%3C/svg%3E";

function TodoRow({ todo, dotColour, onToggle, onDelete }: { todo: Todo; dotColour: string | null; onToggle: (done: boolean) => void; onDelete: () => void }) {
  return (
    <li data-testid="today-todo-row" className="flex items-center gap-[var(--space-related)]">
      <input
        type="checkbox"
        checked={todo.done}
        onChange={(e) => onToggle(e.target.checked)}
        aria-label={todo.label}
        className="h-[18px] w-[18px] shrink-0 cursor-pointer appearance-none rounded-full border-2 border-border bg-surface bg-center bg-no-repeat checked:border-success checked:bg-success"
        style={{ backgroundSize: "11px 11px", backgroundImage: todo.done ? `url("${CHECK_MARK_SVG}")` : undefined }}
      />
      <span className={todo.done ? "flex-1 text-sm text-text-muted line-through" : "flex-1 text-sm"}>{todo.label}</span>
      {todo.dueDate && <span className="whitespace-nowrap text-[length:var(--text-label)] text-text-muted">{formatTodoDueDate(todo.dueDate)}</span>}
      {dotColour && <span aria-hidden="true" className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ backgroundColor: dotColour }} />}
      <button
        type="button"
        aria-label={`Supprimer « ${todo.label} »`}
        onClick={onDelete}
        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center text-text-muted hover:text-text"
      >
        <X aria-hidden="true" focusable="false" size={13} strokeWidth={ICON_STROKE_WIDTH} />
      </button>
    </li>
  );
}

function TodosCard({
  todos,
  documents,
  courseColourByDocumentId,
  onPhotoUploaded,
}: {
  todos: Todo[];
  documents: DocumentSummary[];
  courseColourByDocumentId: Map<string, string>;
  onPhotoUploaded: (jobId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [draft, setDraft] = useState<TodoDraft>(EMPTY_TODO_DRAFT);
  const remaining = todos.filter((t) => !t.done).length;

  const toggleMutation = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => toggleTodo(id, done),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTodo(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
  const createMutation = useMutation({
    mutationFn: (input: { label: string; dueDate: string | null; documentId: string | null }) => createTodo(input),
    onSuccess: () => {
      setDraft(EMPTY_TODO_DRAFT);
      setAddOpen(false);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  return (
    <Card className="flex flex-col gap-[var(--space-block)]" data-testid="todos-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-[var(--space-related)] text-sm font-semibold">
          <ListChecks aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} className="text-primary" />
          Todos
        </div>
        {!addOpen && !photoOpen && (
          <div className="flex items-center gap-[var(--space-related)]">
            <span className="text-[length:var(--text-label)] text-text-muted">{remaining} restants</span>
            <button type="button" aria-label="Ajouter depuis une photo" onClick={() => setPhotoOpen(true)} className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-soft text-primary">
              <Camera aria-hidden="true" focusable="false" size={14} strokeWidth={ICON_STROKE_WIDTH} />
            </button>
            <button type="button" aria-label="Ajouter un todo" onClick={() => setAddOpen(true)} className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-soft text-primary">
              <Plus aria-hidden="true" focusable="false" size={14} strokeWidth={2.2} />
            </button>
          </div>
        )}
      </div>

      {todos.length > 0 && (
        <ul className="flex flex-col gap-[var(--space-block)]">
          {todos.map((todo) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              dotColour={todo.documentId ? (courseColourByDocumentId.get(todo.documentId) ?? null) : null}
              onToggle={(done) => toggleMutation.mutate({ id: todo.id, done })}
              onDelete={() => deleteMutation.mutate(todo.id)}
            />
          ))}
        </ul>
      )}

      {addOpen && (
        <AddTodoForm
          documents={documents}
          pending={createMutation.isPending}
          draft={draft}
          onDraftChange={setDraft}
          onSubmit={(input) => createMutation.mutate(input)}
          onClose={() => setAddOpen(false)}
        />
      )}
      {photoOpen && (
        <PhotoUploadInput
          onUploaded={(jobId) => {
            setPhotoOpen(false);
            onPhotoUploaded(jobId);
          }}
          onClose={() => setPhotoOpen(false)}
        />
      )}
    </Card>
  );
}

// The redesign's own ring-and-tabs visual, wired to the real session
// lifecycle (packages/core/src/workspace's fixed-duration pomodoro,
// apps/web/src/lib/pomodoro-api.ts) instead of a static "25:00" and an
// inert "Démarrer". "Pause courte"/"Pause longue" stay decorative: the
// backend has exactly one fixed duration, no break lengths to select, so
// wiring them would mean inventing a capability that doesn't exist
// server-side. The "N séances de concentration" line counts sessions
// completed since this page was opened (no such count is exposed by the
// API) — it resets on reload by construction, which reads as "since you got
// here" rather than a persisted daily total. "Réinitialiser" clears that
// count back to zero; it is disabled while a session is running (so it can
// never silently diverge from the real, still-live server session) and once
// the count is already zero.
function PomodoroCard() {
  const activeQuery = useQuery({ queryKey: POMODORO_ACTIVE_QUERY_KEY, queryFn: getActivePomodoro, staleTime: Infinity, refetchOnWindowFocus: false });

  const [phase, setPhase] = useState<"idle" | "running">("idle");
  const [session, setSession] = useState<PomodoroSession | null>(null);
  const [resyncNotice, setResyncNotice] = useState(false);
  const [sessionsCompleted, setSessionsCompleted] = useState(0);
  const [, forceTick] = useState(0);

  // Runs once, off the mount fetch only, so a later background refetch can
  // never downgrade a running countdown back to idle just because the
  // session's own window has since elapsed.
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    if (activeQuery.status !== "success") return;
    initializedRef.current = true;
    if (activeQuery.data) {
      setSession(activeQuery.data);
      setPhase("running");
    }
  }, [activeQuery.status, activeQuery.data]);

  useEffect(() => {
    if (phase !== "running") return;
    const interval = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [phase]);

  const startMutation = useMutation({
    mutationFn: () => startPomodoro(null),
    onSuccess: (result) => {
      setSession(result.session);
      setPhase("running");
      setResyncNotice(result.status === "already-active");
    },
  });

  const endMutation = useMutation({
    mutationFn: () => endPomodoro(session!.id),
    onSuccess: () => {
      setPhase("idle");
      setSession(null);
      setResyncNotice(false);
      setSessionsCompleted((n) => n + 1);
    },
  });

  const countdownDisplay = phase === "running" && session ? formatCountdown(remainingSeconds(session)) : IDLE_DISPLAY;

  return (
    <Card className="flex flex-col items-center gap-[var(--space-block)]" data-testid="pomodoro-card">
      <div className="flex w-full items-center gap-[var(--space-related)] text-sm font-semibold">
        <Timer aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} className="text-primary" />
        Pomodoro
      </div>

      <div className="flex w-full rounded-full bg-canvas p-1 text-[length:var(--text-label)] font-medium">
        <span className="flex-1 rounded-full bg-surface py-1.5 text-center font-semibold shadow-[0_1px_2px_rgba(16,24,40,.08)]">Concentration</span>
        <span className="flex-1 py-1.5 text-center text-text-muted">Pause courte</span>
        <span className="flex-1 py-1.5 text-center text-text-muted">Pause longue</span>
      </div>

      <div className="flex h-[170px] w-[170px] items-center justify-center rounded-full border-[10px] border-canvas">
        <div className="flex w-full flex-col items-center gap-1 px-2 text-center">
          <span className="font-[family-name:var(--font-display)] text-[length:var(--text-display)] font-extrabold tabular-nums">{countdownDisplay}</span>
          <span className="text-center text-[length:var(--text-label)] text-text-muted">
            {sessionsCompleted} séance{sessionsCompleted > 1 ? "s" : ""} de concentration
          </span>
          {resyncNotice && <span className="text-[length:var(--text-label)] text-text-muted">Une séance est déjà en cours.</span>}
        </div>
      </div>

      <div className="flex w-full items-center gap-[var(--space-related)]">
        <Button
          variant="secondary"
          aria-label="Réinitialiser"
          disabled={phase === "running" || sessionsCompleted === 0}
          onClick={() => setSessionsCompleted(0)}
          className="h-11 w-11 shrink-0 justify-center rounded-2xl px-0"
        >
          <RotateCcw aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
        </Button>
        {phase === "idle" ? (
          <Button variant="accent" disabled={startMutation.isPending} onClick={() => startMutation.mutate()} className="flex-1 justify-center rounded-2xl">
            <Play aria-hidden="true" focusable="false" size={14} fill="currentColor" strokeWidth={0} />
            {startMutation.isPending ? "Démarrage…" : "Démarrer"}
          </Button>
        ) : (
          <Button variant="accent" disabled={endMutation.isPending} onClick={() => endMutation.mutate()} className="flex-1 justify-center rounded-2xl">
            {endMutation.isPending ? "…" : "Terminer"}
          </Button>
        )}
      </div>
    </Card>
  );
}

// Still a mock, not yet backed by real audio (unlike the pomodoro above) —
// wired later, one piece at a time, same as every other section of this
// screen was.
function StudySoundsCard() {
  return (
    <Card className="flex flex-col gap-[var(--space-block)]" data-testid="study-sounds-card">
      <div className="flex items-center gap-[var(--space-related)] text-sm font-semibold">
        <Music aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
        Sons d'ambiance
      </div>

      <div className="flex items-center gap-[var(--space-related)]">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-button)] bg-primary-soft">
          <Music aria-hidden="true" focusable="false" size={18} strokeWidth={ICON_STROKE_WIDTH} color="#0f7b5f" />
        </div>
        <div className="flex flex-col">
          <span className="text-[length:var(--text-label)] text-text-muted">Sons de concentration</span>
          <span className="text-sm font-bold">Rainy Window</span>
          <span className="text-[length:var(--text-label)] text-text-muted">Lo-Fi Study Club</span>
        </div>
      </div>

      <div className="flex flex-col gap-[var(--space-related)]">
        <div className="relative h-1 rounded-full bg-border">
          <div className="absolute left-0 top-0 h-1 w-[16%] rounded-full bg-primary" />
        </div>
        <div className="flex justify-between text-[length:var(--text-label)] text-text-muted">
          <span>0:37</span>
          <span>3:38</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-[var(--space-block)]">
        <button type="button" aria-label="Piste précédente" className="text-text-muted">
          <SkipBack aria-hidden="true" focusable="false" size={18} fill="currentColor" strokeWidth={0} />
        </button>
        <button type="button" aria-label="Lecture" className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-primary text-white">
          <Play aria-hidden="true" focusable="false" size={14} fill="currentColor" strokeWidth={0} />
        </button>
        <button type="button" aria-label="Piste suivante" className="text-text-muted">
          <SkipForward aria-hidden="true" focusable="false" size={18} fill="currentColor" strokeWidth={0} />
        </button>
        <div className="ml-1 flex items-center gap-[var(--space-related)]">
          <Volume2 aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} className="text-text-muted" />
          <div className="relative h-1 w-[52px] rounded-full bg-border">
            <div className="absolute left-0 top-0 h-1 w-[65%] rounded-full bg-text-muted" />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between rounded-[var(--radius-button)] bg-primary-soft px-2.5 py-2">
          <span className="text-sm font-semibold text-primary">Rainy Window</span>
          <span className="text-[length:var(--text-label)] text-primary">3:38</span>
        </div>
        <div className="flex items-center justify-between rounded-[var(--radius-button)] px-2.5 py-2">
          <span className="text-sm">Deep Focus</span>
          <span className="text-[length:var(--text-label)] text-text-muted">3:14</span>
        </div>
      </div>
    </Card>
  );
}

// The redesigned Aujourd'hui screen (M9's own "Today" prototype, now
// promoted to replace the previous implementation of this screen wholesale
// — courses, todos, and the pomodoro are all wired to real data; only the
// study-sounds player stays mock). username is a prop, not this screen's own
// useAuth() call, matching this codebase's convention that only App.tsx
// calls useAuth() directly.
export function TodayScreen({
  username,
  onReviewCourse,
  onOpenProposals,
}: {
  username: string;
  onReviewCourse?: (documentId: string) => void;
  onOpenProposals: (jobId: string) => void;
}) {
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: getToday });
  // Only feeds the add-todo form's own course picker: a course with nothing
  // to signal today never reaches TodayView (see buildCourseCards), but it
  // must still be selectable when adding a todo by hand.
  const documentsQuery = useQuery({ queryKey: DOCUMENTS_QUERY_KEY, queryFn: listDocuments });

  const view = query.data;
  const courseCards = view ? buildCourseCards(view) : [];
  const totalDue = view ? view.dueCards.reduce((sum, c) => sum + c.count, 0) : 0;
  const courseColourByDocumentId = new Map(courseCards.filter((c) => c.colour !== null).map((c) => [c.documentId, c.colour as string]));

  return (
    <div className="flex flex-col gap-[var(--space-section)]">
      {/* Full width, above the two-column row below — not sharing that
          row with the sidebar's own Pomodoro card, so Pomodoro's own top
          edge lines up with "À réviser aujourd'hui" (this row's own first
          item), not with this greeting sitting above it. */}
      {view && (
        <div className="flex flex-col gap-[var(--space-related)]">
          <p className="text-sm font-semibold text-primary">{formatGreetingDate(view.date)}</p>
          <h1 className="font-[family-name:var(--font-display)] text-[length:var(--text-display)] font-extrabold">Bonjour, {username}</h1>
          {totalDue > 0 ? (
            <p className="text-sm text-text-muted">
              Tu as <strong className="font-semibold text-text">{totalDue} fiche{totalDue > 1 ? "s" : ""}</strong> à réviser dans {view.dueCards.length} cours. 25
              minutes de concentration suffisent pour garder de l'avance.
            </p>
          ) : (
            <p className="text-sm text-text-muted">Rien à réviser pour l'instant. Profites-en pour avancer sur autre chose.</p>
          )}
        </div>
      )}

      <div className="flex gap-[var(--space-section)]">
        <main className="flex flex-1 flex-col gap-[var(--space-section)]">
          {query.status === "pending" && <p className="text-sm text-text-muted">Chargement…</p>}
          {query.status === "error" && <p role="alert">Impossible de charger ta journée. Vérifie ta connexion et réessaie.</p>}
          {view && (
            <>
              {courseCards.length > 0 && (
                <div className="flex flex-col gap-[var(--space-block)]">
                  <div className="flex items-center gap-[var(--space-related)] text-sm font-semibold">
                    <Calendar aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
                    À réviser aujourd'hui
                  </div>
                  <div className="grid grid-cols-1 gap-[var(--space-block)] sm:grid-cols-2">
                    {courseCards.map((course) => (
                      <CourseCard key={course.documentId} course={course} onReviewCourse={onReviewCourse} />
                    ))}
                  </div>
                </div>
              )}

              <TodosCard todos={view.todos} documents={documentsQuery.data ?? []} courseColourByDocumentId={courseColourByDocumentId} onPhotoUploaded={onOpenProposals} />
            </>
          )}
        </main>

        <div className="flex w-[300px] shrink-0 flex-col gap-[var(--space-section)]">
          <PomodoroCard />
          <StudySoundsCard />
        </div>
      </div>
    </div>
  );
}
