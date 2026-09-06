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
import { useEffect, useRef, useState } from "react";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { listDocuments } from "../lib/documents-api.js";
import { ICON_SIZE_INLINE, ICON_STROKE_WIDTH } from "../lib/icons.js";
import { endPomodoro, getActivePomodoro, startPomodoro, type PomodoroSession } from "../lib/pomodoro-api.js";
import { createTodo, deleteTodo, getToday, toggleTodo, type Todo } from "../lib/today-api.js";
import {
  AddTodoForm,
  buildCourseCards,
  countdownLabel,
  EMPTY_TODO_DRAFT,
  formatTodoDueDate,
  PhotoUploadInput,
  type CourseCard as CourseCardData,
  type TodoDraft,
} from "./TodayScreen.js";
import { formatCountdown, remainingSeconds } from "./PomodoroCard.js";

const QUERY_KEY = ["today"];
const DOCUMENTS_QUERY_KEY = ["documents"];
const POMODORO_ACTIVE_QUERY_KEY = ["pomodoro-active"];
// The backend's own pomodoro duration is fixed (packages/core/src/workspace),
// never selectable — hardcoded here rather than discovered, since there is
// no session yet to read a real durationSeconds from before one starts.
const IDLE_DISPLAY = "25:00";

// Front-end prototype, approved from a design mockup (see the reviewed
// artifact), reachable from App.tsx's own nav as a temporary staging
// entry. Courses, todos, the sidebar (now App.tsx's own real AppNav) and
// the connected user's name are wired to real data; the pomodoro card and
// the study-sounds player are still hardcoded, wired one piece at a time.
//
// Knowingly departs from one of docs/UI.md's existing rules for the
// shipped Aujourd'hui screen, per the approved mockup — the user asked
// not to worry about reconciling this with docs/UI.md for now (that
// happens later, whenever this replaces the real Aujourd'hui): the course
// cards' subject icon sits in a tinted circle (a subject-colour tint),
// where the shipped screen uses a left border only ("Card left border,
// not a tinted background").
function CourseCard({ course, onReviewCourse }: { course: CourseCardData; onReviewCourse?: (documentId: string) => void }) {
  const colour = course.colour ?? "#667085";
  return (
    <Card className="flex flex-col gap-[var(--space-block)]" data-testid="course-today-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-[var(--space-related)]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${colour}26` }}>
            <BookOpen aria-hidden="true" focusable="false" size={18} strokeWidth={ICON_STROKE_WIDTH} color={colour} />
          </span>
          <span className="truncate font-[family-name:var(--font-display)] text-sm font-bold">{course.documentTitle}</span>
        </div>
        {course.deadline && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[length:var(--text-label)] font-semibold whitespace-nowrap text-warning">
            <Clock aria-hidden="true" focusable="false" size={12} strokeWidth={ICON_STROKE_WIDTH} />
            {countdownLabel(course.deadline.daysAway)}
          </span>
        )}
      </div>

      {course.dueCount > 0 ? (
        <p>
          <span className="font-[family-name:var(--font-display)] text-[length:var(--text-display)] font-extrabold tabular-nums">{course.dueCount}</span>{" "}
          <span className="text-sm text-text-muted">fiche{course.dueCount > 1 ? "s" : ""} à revoir</span>
        </p>
      ) : (
        <p className="flex items-center gap-[var(--space-related)] text-sm font-semibold text-success">
          <Check aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
          Tout est à jour
        </p>
      )}

      {course.dueCount > 0 ? (
        <Button variant="accent" className="w-full justify-center" onClick={() => onReviewCourse?.(course.documentId)}>
          Réviser
          <ArrowRight aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
        </Button>
      ) : (
        <Button variant="secondary" disabled className="w-full justify-center">
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

// Manual entry (label + date + course) and the photo-extraction flow are
// both real now, reusing TodayScreen.tsx's own AddTodoForm/PhotoUploadInput
// rather than a second, narrower implementation — "c'est déjà dispo dans
// l'API" was true for both before this pass, only their trigger here (a
// compact "+"/camera pair, not two full-width buttons) is new.
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
    <Card className="flex flex-col gap-[var(--space-block)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-[var(--space-related)] text-sm font-semibold">
          <ListChecks aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
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

// The mockup's own ring-and-tabs visual, wired to the real session
// lifecycle (packages/core/src/workspace's fixed-duration pomodoro,
// apps/web/src/lib/pomodoro-api.ts) instead of a static "25:00" and an
// inert "Démarrer" — the same start/end/resume mechanics TodayScreen.tsx's
// own PomodoroCard already ships, reusing its remainingSeconds/
// formatCountdown rather than a second copy. "Pause courte"/"Pause longue"
// stay decorative: the backend has exactly one fixed duration, no break
// lengths to select, so wiring them would mean inventing a capability that
// doesn't exist server-side. The "N séances de concentration" line counts
// sessions completed since this page was opened (no such count is exposed
// by the API) — it resets on reload by construction, which reads as "since
// you got here" rather than a persisted daily total. "Réinitialiser" clears
// that count back to zero; it is disabled while a session is running (so it
// can never silently diverge from the real, still-live server session) and
// once the count is already zero.
function PomodoroCard() {
  const activeQuery = useQuery({ queryKey: POMODORO_ACTIVE_QUERY_KEY, queryFn: getActivePomodoro, staleTime: Infinity, refetchOnWindowFocus: false });

  const [phase, setPhase] = useState<"idle" | "running">("idle");
  const [session, setSession] = useState<PomodoroSession | null>(null);
  const [resyncNotice, setResyncNotice] = useState(false);
  const [sessionsCompleted, setSessionsCompleted] = useState(0);
  const [, forceTick] = useState(0);

  // Mirrors PomodoroCard.tsx's own mount-resume effect: runs once, off the
  // initial fetch only, so a later background refetch can never downgrade a
  // running countdown back to idle just because the session's own window
  // has since elapsed.
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
    <Card className="flex flex-col items-center gap-[var(--space-block)]">
      <div className="flex w-full items-center gap-[var(--space-related)] text-sm font-semibold">
        <Timer aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
        Pomodoro
      </div>

      <div className="flex w-full rounded-full bg-canvas p-[3px] text-[length:var(--text-label)] font-medium">
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
          className="h-11 w-11 shrink-0 justify-center px-0"
        >
          <RotateCcw aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
        </Button>
        {phase === "idle" ? (
          <Button variant="accent" disabled={startMutation.isPending} onClick={() => startMutation.mutate()} className="flex-1 justify-center">
            <Play aria-hidden="true" focusable="false" size={14} fill="currentColor" strokeWidth={0} />
            {startMutation.isPending ? "Démarrage…" : "Démarrer"}
          </Button>
        ) : (
          <Button variant="accent" disabled={endMutation.isPending} onClick={() => endMutation.mutate()} className="flex-1 justify-center">
            {endMutation.isPending ? "…" : "Terminer"}
          </Button>
        )}
      </div>
    </Card>
  );
}

function StudySoundsCard() {
  return (
    <Card className="flex flex-col gap-[var(--space-block)]">
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

export function Today({
  username,
  onReviewCourse,
  onOpenProposals,
}: {
  username: string;
  onReviewCourse?: (documentId: string) => void;
  onOpenProposals: (jobId: string) => void;
}) {
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: getToday });
  // Only feeds the add-todo form's own course picker, same reasoning as
  // TodayScreen.tsx's own identical read: a course with nothing to signal
  // today never reaches TodayView, but must still be selectable by hand.
  const documentsQuery = useQuery({ queryKey: DOCUMENTS_QUERY_KEY, queryFn: listDocuments });

  return (
    <div className="flex gap-[var(--space-section)]">
      <main className="flex flex-1 flex-col gap-[var(--space-section)]">
        {query.status === "pending" && <p className="text-sm text-text-muted">Chargement…</p>}
        {query.status === "error" && <p role="alert">Impossible de charger ta journée. Vérifie ta connexion et réessaie.</p>}
        {query.status === "success" &&
          (() => {
            const view = query.data;
            const courseCards = buildCourseCards(view);
            const totalDue = view.dueCards.reduce((sum, c) => sum + c.count, 0);
            const courseColourByDocumentId = new Map(courseCards.filter((c) => c.colour !== null).map((c) => [c.documentId, c.colour as string]));

            return (
              <>
                <div className="flex flex-col gap-[var(--space-related)]">
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
            );
          })()}
      </main>

      <div className="flex w-[300px] shrink-0 flex-col gap-[var(--space-section)]">
        <PomodoroCard />
        <StudySoundsCard />
      </div>
    </div>
  );
}
