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
  Pause,
  Play,
  Plus,
  RotateCcw,
  Timer,
  Volume2,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { FIELD_CLASS, SELECT_CHEVRON } from "../components/ui/field-styles.js";
import { AMBIENT_SOUND_KINDS } from "../lib/ambient-sound-graph.js";
import { listDocuments } from "../lib/documents-api.js";
import { ICON_SIZE_INLINE, ICON_STROKE_WIDTH } from "../lib/icons.js";
import { uploadTodoPhoto } from "../lib/proposals-api.js";
import { EXPAND_TAP_TARGET_44 } from "../lib/tap-target.js";
import { createTodo, deleteTodo, getToday, toggleTodo, type TodayView, type Todo } from "../lib/today-api.js";
import { ambientSoundLabel, useAmbientSound } from "../lib/use-ambient-sound.js";
import { formatCountdown, pomodoroFinishedLabel, pomodoroSessionTypeLabel, sessionType, useActivePomodoro } from "../lib/use-active-pomodoro.js";
import type { PomodoroSessionType } from "../lib/pomodoro-api.js";

const QUERY_KEY = ["today"];
const DOCUMENTS_QUERY_KEY = ["documents"];
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

// EXPAND_TAP_TARGET_44 (apps/web/src/lib/tap-target.ts): a todo's own
// checkbox and delete button, and the two todos-card triggers, all use it.
// A native `<input>` cannot host a `::before` pseudo-element at all (a
// replaced element, undefined by the CSS spec) — the checkbox below wraps
// it in a `<label>` instead, sized to the checkbox's own visible box, and
// puts the pattern on the label: clicking anywhere in the label's own
// (enlarged) box still toggles the input it wraps, the ordinary behaviour
// of a `<label>` around a control, no `htmlFor` needed.

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
      <label className={`flex h-[18px] w-[18px] shrink-0 ${EXPAND_TAP_TARGET_44}`}>
        <input
          type="checkbox"
          checked={todo.done}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label={todo.label}
          className="h-[18px] w-[18px] shrink-0 cursor-pointer appearance-none rounded-full border-2 border-border bg-surface bg-center bg-no-repeat checked:border-success checked:bg-success"
          style={{ backgroundSize: "11px 11px", backgroundImage: todo.done ? `url("${CHECK_MARK_SVG}")` : undefined }}
        />
      </label>
      <span className={todo.done ? "flex-1 text-sm text-text-muted line-through" : "flex-1 text-sm"}>{todo.label}</span>
      {todo.dueDate && <span className="whitespace-nowrap text-[length:var(--text-label)] text-text-muted">{formatTodoDueDate(todo.dueDate)}</span>}
      {dotColour && <span aria-hidden="true" className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ backgroundColor: dotColour }} />}
      <button
        type="button"
        aria-label={`Supprimer « ${todo.label} »`}
        onClick={onDelete}
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center text-text-muted hover:text-text ${EXPAND_TAP_TARGET_44}`}
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
            <button
              type="button"
              aria-label="Ajouter depuis une photo"
              onClick={() => setPhotoOpen(true)}
              className={`flex h-6 w-6 items-center justify-center rounded-full bg-primary-soft text-primary ${EXPAND_TAP_TARGET_44}`}
            >
              <Camera aria-hidden="true" focusable="false" size={14} strokeWidth={ICON_STROKE_WIDTH} />
            </button>
            <button
              type="button"
              aria-label="Ajouter un todo"
              onClick={() => setAddOpen(true)}
              className={`flex h-6 w-6 items-center justify-center rounded-full bg-primary-soft text-primary ${EXPAND_TAP_TARGET_44}`}
            >
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
// apps/web/src/lib/use-active-pomodoro.ts) instead of a static "25:00" and
// an inert "Démarrer". "Pause courte"/"Pause longue" stay decorative: the
// backend has exactly one fixed duration, no break lengths to select, so
// wiring them would mean inventing a capability that doesn't exist
// server-side. The "N séances de concentration" line counts sessions
// completed since this page was opened (no such count is exposed by the
// API) — it resets on reload by construction, which reads as "since you got
// here" rather than a persisted daily total, and stays local to this card
// (never lifted into the shared hook): it is client-only bookkeeping, not
// part of the session the server or the header widget need to agree on.
// "Réinitialiser" clears that count back to zero; it is disabled while a
// session is running (so it can never silently diverge from the real,
// still-live server session) and once the count is already zero.
// The ring's own diameter/stroke, unchanged from the plain bordered circle
// it replaces (docs/UI.md's Aujourd'hui — pomodoro note): at rest the two
// must be visually identical, only a real session running or finished draws
// an arc at all.
const POMODORO_RING_SIZE = 170;
const POMODORO_RING_STROKE = 10;

// Redrawn on useActivePomodoro's own existing 1-second tick, never a
// continuous CSS animation: on a 25-minute session one second is 0.067% of
// the arc, so the smoothness a transition would buy is invisible, and it
// would cost this file a visibility-change handler it does not otherwise
// need (docs/UI.md's Motion section: recorded there as an argued exception,
// not a default). aria-hidden — the textual countdown right beside it
// already carries the same information, and specifically never
// role="progressbar": a value announced every second for up to 25 minutes
// straight would be a uniquely bad screen-reader experience.
function PomodoroRing({ ratio }: { ratio: number }) {
  const size = POMODORO_RING_SIZE;
  const stroke = POMODORO_RING_STROKE;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - ratio);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false" className="absolute inset-0">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-canvas)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

// The three session types, in the order the segmented control has always
// shown them (M10 Phase 2, lot 3) — a real radiogroup now, not three
// decorative <span>s.
const POMODORO_TYPES: PomodoroSessionType[] = ["focus", "shortBreak", "longBreak"];

function PomodoroCard() {
  const pomodoro = useActivePomodoro();
  const { phase, start, end, starting, ending } = pomodoro;
  const [resyncNotice, setResyncNotice] = useState(false);
  const [sessionsCompleted, setSessionsCompleted] = useState(0);
  // The user's own next choice while idle; while a session is running or
  // finished, the radio group instead reflects that real session's own
  // type (below), not this — resuming a break on reload must show "Pause
  // courte" checked even though this state's own default is "focus".
  const [selectedType, setSelectedType] = useState<PomodoroSessionType>("focus");

  // The explicit trap this lot's own spec calls out: sessionsCompleted must
  // keep incrementing once the zero-arrival close call moves out to
  // PomodoroEffects (mounted only in App.tsx, not here) — otherwise a
  // session that runs out the clock, rather than being stopped by hand,
  // would silently stop counting. This ref is shared by both paths that can
  // count a session, not just the "reached finished on its own" effect
  // below: handleEnd's own manual "Terminer" continuation uses it too,
  // because the two can race — `end()` is a real network round trip, and
  // the countdown's own real interval keeps ticking on the still-cached
  // session while that call is in flight, so a manual close and the
  // natural zero-arrival effect can both be "in progress" for the same
  // session at once. Whichever settles first must stop the other from
  // counting it again. Type-gated (M10 Phase 2, lot 3): the label reads "N
  // séance(s) de concentration" specifically, so a closed break must never
  // move it — the ref is still updated so a break's own session id is
  // never miscounted twice, only the actual increment is skipped.
  const countedSessionIdRef = useRef<string | null>(null);
  function countSessionOnce(sessionId: string, type: PomodoroSessionType) {
    if (countedSessionIdRef.current === sessionId) return;
    countedSessionIdRef.current = sessionId;
    if (type === "focus") setSessionsCompleted((n) => n + 1);
  }

  async function handleStart() {
    const result = await start(selectedType);
    setResyncNotice(result.status === "already-active");
  }

  async function handleEnd() {
    // Captured before the await: end() resolves only after that round
    // trip, during which the interval above can already have flipped this
    // same session to "finished" (and counted it) — this must name the
    // session that was running when "Terminer" was clicked, not whatever
    // the cache holds once the await settles.
    const endingSession = pomodoro.phase !== "idle" ? pomodoro.session : null;
    await end();
    setResyncNotice(false);
    if (endingSession) countSessionOnce(endingSession.id, sessionType(endingSession));
  }

  // Narrowed off `pomodoro.phase` directly (not a separately destructured
  // `session`) so TypeScript still ties session's non-null type to the
  // "finished" branch of the union.
  useEffect(() => {
    if (pomodoro.phase !== "finished") return;
    countSessionOnce(pomodoro.session.id, sessionType(pomodoro.session));
  }, [pomodoro]);

  const countdownDisplay = pomodoro.phase === "idle" ? IDLE_DISPLAY : formatCountdown(pomodoro.remainingSeconds);
  const ringRatio = pomodoro.phase === "idle" ? 0 : pomodoro.elapsedRatio;
  // Disabled for the whole non-idle window, running and finished alike —
  // the same idle-vs-not split "Réinitialiser" already uses just below.
  // Re-enabling mid-"finished" would let a person pick a different type
  // before that session has even closed, and would fight the type this
  // same window's own "Pause/Séance terminée" label is reporting.
  const radioDisabled = pomodoro.phase !== "idle";
  const activeType = pomodoro.phase === "idle" ? selectedType : sessionType(pomodoro.session);

  return (
    <Card className="flex flex-col items-center gap-[var(--space-block)]" data-testid="pomodoro-card">
      <div className="flex w-full items-center gap-[var(--space-related)] text-sm font-semibold">
        <Timer aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} className="text-primary" />
        Pomodoro
      </div>

      <div role="radiogroup" aria-label="Type de séance" className="flex w-full rounded-full bg-canvas p-1 text-[length:var(--text-label)] font-medium">
        {POMODORO_TYPES.map((type) => {
          const checked = activeType === type;
          return (
            <label
              key={type}
              className={`flex min-h-11 flex-1 items-center justify-center rounded-full py-1.5 text-center ${radioDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${
                checked ? "bg-surface font-semibold shadow-[0_1px_2px_rgba(16,24,40,.08)]" : "text-text-muted"
              }`}
            >
              <input
                type="radio"
                name="pomodoro-type"
                value={type}
                checked={checked}
                disabled={radioDisabled}
                onChange={() => setSelectedType(type)}
                aria-label={pomodoroSessionTypeLabel(type)}
                className="sr-only"
              />
              {pomodoroSessionTypeLabel(type)}
            </label>
          );
        })}
      </div>

      <div className="relative flex h-[170px] w-[170px] shrink-0 items-center justify-center rounded-full">
        <PomodoroRing ratio={ringRatio} />
        {/* w-[150px], not w-full: the old bordered circle (border-[10px])
            gave its text child a 150px-wide content box (170 - 2×10,
            border-box sizing); the ring draws its stroke in the SVG instead
            of a real border, so nothing here shrinks that width on its own
            any more. Left at w-full, the text column would be 170px wide
            instead — enough for "0 séance de concentration" to stop
            wrapping onto its own line, which shortens the whole block and
            visibly shifts the countdown a few pixels within the ring. */}
        <div className="relative flex w-[150px] flex-col items-center gap-1 px-2 text-center">
          <span className="font-[family-name:var(--font-display)] text-[length:var(--text-display)] font-extrabold tabular-nums">{countdownDisplay}</span>
          <span className="text-center text-[length:var(--text-label)] text-text-muted">
            {sessionsCompleted} séance{sessionsCompleted > 1 ? "s" : ""} de concentration
          </span>
          {phase === "finished" && (
            <span className="text-center text-[length:var(--text-label)] font-semibold text-primary">{pomodoroFinishedLabel(activeType)} !</span>
          )}
          {resyncNotice && <span className="text-[length:var(--text-label)] text-text-muted">Une séance est déjà en cours.</span>}
        </div>
      </div>

      <div className="flex w-full items-center gap-[var(--space-related)]">
        <Button
          variant="secondary"
          aria-label="Réinitialiser"
          disabled={phase !== "idle" || sessionsCompleted === 0}
          onClick={() => setSessionsCompleted(0)}
          className="h-11 w-11 shrink-0 justify-center rounded-2xl px-0"
        >
          <RotateCcw aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
        </Button>
        {phase === "running" ? (
          <Button variant="accent" disabled={ending} onClick={() => void handleEnd()} className="flex-1 justify-center rounded-2xl">
            {ending ? "…" : "Terminer"}
          </Button>
        ) : (
          <Button variant="accent" disabled={starting} onClick={() => void handleStart()} className="flex-1 justify-center rounded-2xl">
            <Play aria-hidden="true" focusable="false" size={14} fill="currentColor" strokeWidth={0} />
            {starting ? "Démarrage…" : "Démarrer"}
          </Button>
        )}
      </div>
    </Card>
  );
}

// M10 Phase 2, lot 4: real, synthesized ambient noise (Web Audio, no audio
// file — apps/web/src/lib/ambient-sound-graph.ts), no longer a mock music
// player. The previous mockup promised things synthesis cannot honestly
// keep — an artist line ("Lo-Fi Study Club"), track durations, a scrubbable
// position, previous/next transport — and all of it is gone rather than
// wired to a fake value: a noise generator has no artist, no duration, no
// position, and nothing before or after the one sound currently selected.
// What remains is exactly the three real capabilities left: pick a sound,
// play or pause it, set its volume. The graph itself lives in
// AmbientSoundEffects (mounted once in App.tsx, docs/UI.md's own note) —
// this card only reads useAmbientSound's state and calls its actions.
function StudySoundsCard() {
  const { kind, playing, volume, select, play, pause, setVolume } = useAmbientSound();

  return (
    <Card className="flex flex-col gap-[var(--space-block)]" data-testid="study-sounds-card">
      <div className="flex items-center gap-[var(--space-related)] text-sm font-semibold">
        <Music aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
        Sons d'ambiance
      </div>

      <div role="radiogroup" aria-label="Son d'ambiance" className="flex flex-col gap-1">
        {AMBIENT_SOUND_KINDS.map((soundKind) => {
          const checked = kind === soundKind;
          const label = ambientSoundLabel(soundKind);
          return (
            <label
              key={soundKind}
              className={`flex min-h-11 cursor-pointer items-center rounded-[var(--radius-button)] px-2.5 text-sm ${
                checked ? "bg-primary-soft font-semibold text-primary" : "text-text"
              }`}
            >
              <input
                type="radio"
                name="ambient-sound"
                value={soundKind}
                checked={checked}
                onChange={() => select(soundKind)}
                aria-label={label}
                className="sr-only"
              />
              {label}
            </label>
          );
        })}
      </div>

      <div className="flex items-center gap-[var(--space-related)]">
        <Button
          variant="accent"
          aria-label={playing ? "Pause" : "Lecture"}
          onClick={() => (playing ? pause() : play())}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full p-0"
        >
          {playing ? (
            <Pause aria-hidden="true" focusable="false" size={16} fill="currentColor" strokeWidth={0} />
          ) : (
            <Play aria-hidden="true" focusable="false" size={16} fill="currentColor" strokeWidth={0} />
          )}
        </Button>
        <Volume2 aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} className="shrink-0 text-text-muted" />
        {/* h-11: the input's own layout box is the real touch target here,
            not a pseudo-element halo — this is a brand-new control, not an
            M10 Phase 1 pass, so there is no existing small hit area to work
            around (docs/UI.md's own Aujourd'hui — study sounds note). */}
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          aria-label="Volume"
          className="h-11 w-full flex-1 accent-primary"
        />
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
    <div className="flex flex-col gap-[var(--space-section)] p-4 md:p-8">
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

      <div className="flex flex-col gap-[var(--space-section)] md:flex-row">
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

        <div className="flex w-full flex-col gap-[var(--space-section)] md:w-[300px] md:shrink-0">
          <PomodoroCard />
          <StudySoundsCard />
        </div>
      </div>
    </div>
  );
}
