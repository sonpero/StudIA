import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  BookOpenText,
  Calendar,
  Check,
  Clock,
  Flame,
  GraduationCap,
  Home,
  Layers,
  ListChecks,
  MessageCircle,
  Music,
  Play,
  Plus,
  RotateCcw,
  SkipBack,
  SkipForward,
  Timer,
  TrendingUp,
  Volume2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { FIELD_CLASS } from "../components/ui/field-styles.js";
import { ICON_SIZE_INLINE, ICON_SIZE_NAV, ICON_STROKE_WIDTH } from "../lib/icons.js";
import { createTodo, deleteTodo, getToday, toggleTodo, type Todo } from "../lib/today-api.js";
import { buildCourseCards, countdownLabel, formatTodoDueDate, type CourseCard as CourseCardData } from "./TodayScreen.js";

const QUERY_KEY = ["today"];

// Front-end prototype, approved from a design mockup (see the reviewed
// artifact), reachable from App.tsx's own nav as a temporary staging
// entry. Courses and todos are wired to the real GET /api/today (the same
// endpoint and the same buildCourseCards fold the shipped Aujourd'hui
// already uses — re-exported from TodayScreen.tsx rather than
// duplicated); the streak, the user chip, the pomodoro card and the
// study-sounds player are still hardcoded, wired one piece at a time.
//
// Knowingly departs from two of docs/UI.md's existing rules for the
// shipped Aujourd'hui screen, per the approved mockup — the user asked
// not to worry about reconciling this with docs/UI.md for now (that
// happens later, whenever this replaces the real Aujourd'hui):
// - the course cards' subject icon sits in a tinted circle (a subject-
//   colour tint), where the shipped screen uses a left border only
//   ("Card left border, not a tinted background").
// - the sidebar streak card has a flame icon, which "no flame icon, no
//   fire emoji" (the shipped streak card's own rule) bans outright.
const NAV_ITEMS: { label: string; icon: LucideIcon; active?: boolean }[] = [
  { label: "Aujourd'hui", icon: Home, active: true },
  { label: "Mes cours", icon: BookOpen },
  { label: "Notions", icon: Layers },
  { label: "Lecteur", icon: BookOpenText },
  { label: "Progression", icon: TrendingUp },
  { label: "Calendrier", icon: Calendar },
  { label: "Tuteur", icon: MessageCircle },
];

function Sidebar({ onExit }: { onExit?: () => void }) {
  return (
    <div className="flex w-60 shrink-0 flex-col gap-[var(--space-section)] border-r border-border p-4">
      <div className="flex items-center gap-2 px-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-button)] bg-primary">
          <GraduationCap aria-hidden="true" focusable="false" size={20} strokeWidth={ICON_STROKE_WIDTH} color="#fff" />
        </div>
        <div className="flex flex-col">
          <span className="font-[family-name:var(--font-display)] text-base font-extrabold leading-tight">StudIA</span>
          <span className="text-[length:var(--text-label)] leading-tight text-text-muted">Étudie plus intelligemment</span>
        </div>
      </div>

      <nav aria-label="Navigation principale" className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          // The only piece of real navigation so far: "Aujourd'hui"
          // returns to the real app. Every other item stays a static row
          // until its own screen exists here.
          const onClick = item.label === "Aujourd'hui" ? onExit : undefined;
          return (
            <button
              key={item.label}
              type="button"
              onClick={onClick}
              aria-current={item.active ? "page" : undefined}
              className={
                item.active
                  ? "flex items-center gap-2.5 rounded-full bg-primary-soft px-3 py-2 text-sm font-semibold text-primary"
                  : "flex items-center gap-2.5 rounded-full px-3 py-2 text-sm text-text-muted"
              }
            >
              <Icon aria-hidden="true" focusable="false" size={ICON_SIZE_NAV} strokeWidth={ICON_STROKE_WIDTH} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="flex-1" />

      {/* Still mock: the streak isn't wired this pass. */}
      <Card className="flex items-center gap-2.5 p-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/10">
          <Flame aria-hidden="true" focusable="false" size={16} strokeWidth={ICON_STROKE_WIDTH} color="#f5b940" />
        </span>
        <div className="flex flex-col">
          <span className="text-sm font-bold">Série de 9 jours</span>
          <span className="text-[length:var(--text-label)] text-text-muted">Continue comme ça !</span>
        </div>
      </Card>

      <div className="flex items-center gap-2.5 px-1">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">LM</div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold leading-tight">Léa Martin</span>
          <span className="text-[length:var(--text-label)] leading-tight text-text-muted">24 fiches à réviser</span>
        </div>
      </div>
    </div>
  );
}

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

function TodoRow({ todo, dotColour, onToggle, onDelete }: { todo: Todo; dotColour: string | null; onToggle: (done: boolean) => void; onDelete: () => void }) {
  return (
    <li data-testid="today-todo-row" className="flex items-center gap-[var(--space-related)]">
      <input
        type="checkbox"
        checked={todo.done}
        onChange={(e) => onToggle(e.target.checked)}
        aria-label={todo.label}
        className="h-[18px] w-[18px] shrink-0 accent-success"
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

// Minimal by design: a label only, matching the API's own "label required,
// everything else optional" contract — the mockup's own "+" affordance
// never specified a fuller form (date, course), so this doesn't invent one.
function AddTodoForm({ onSubmit, onClose }: { onSubmit: (label: string) => void; onClose: () => void }) {
  const [label, setLabel] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <form
      className="flex items-center gap-[var(--space-related)]"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = label.trim();
        if (!trimmed) return;
        onSubmit(trimmed);
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        Nouveau todo
      </label>
      <input id={inputId} ref={inputRef} required value={label} onChange={(e) => setLabel(e.target.value)} className={`${FIELD_CLASS} flex-1 py-1.5 text-sm`} placeholder="Nouveau todo" />
      <button type="submit" aria-label="Confirmer l'ajout" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Check aria-hidden="true" focusable="false" size={14} strokeWidth={2.2} />
      </button>
    </form>
  );
}

function TodosCard({ todos, courseColourByDocumentId }: { todos: Todo[]; courseColourByDocumentId: Map<string, string> }) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
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
    mutationFn: (label: string) => createTodo({ label, dueDate: null, documentId: null }),
    onSuccess: () => {
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
        {addOpen ? (
          <AddTodoForm onSubmit={(label) => createMutation.mutate(label)} onClose={() => setAddOpen(false)} />
        ) : (
          <div className="flex items-center gap-[var(--space-related)]">
            <span className="text-[length:var(--text-label)] text-text-muted">{remaining} restants</span>
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
    </Card>
  );
}

function PomodoroCard() {
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
        <div className="flex flex-col items-center gap-1">
          <span className="font-[family-name:var(--font-display)] text-[length:var(--text-display)] font-extrabold tabular-nums">25:00</span>
          <span className="text-[length:var(--text-label)] text-text-muted">2 séances de concentration</span>
        </div>
      </div>

      <div className="flex w-full items-center gap-[var(--space-related)]">
        <Button variant="secondary" aria-label="Réinitialiser" className="h-11 w-11 shrink-0 justify-center px-0">
          <RotateCcw aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
        </Button>
        <Button variant="accent" className="flex-1 justify-center">
          <Play aria-hidden="true" focusable="false" size={14} fill="currentColor" strokeWidth={0} />
          Démarrer
        </Button>
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

export function Today({ onExit, onReviewCourse }: { onExit?: () => void; onReviewCourse?: (documentId: string) => void } = {}) {
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: getToday });

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar onExit={onExit} />

      <div className="flex flex-1 gap-[var(--space-section)] p-8">
        <main className="flex flex-1 flex-col gap-[var(--space-section)]">
          {query.status === "pending" && <p className="text-sm text-text-muted">Chargement…</p>}
          {query.status === "error" && <p role="alert">Impossible de charger ta journée. Vérifie ta connexion et réessaie.</p>}
          {query.status === "success" && (() => {
            const view = query.data;
            const courseCards = buildCourseCards(view);
            const totalDue = view.dueCards.reduce((sum, c) => sum + c.count, 0);
            const courseColourByDocumentId = new Map(courseCards.filter((c) => c.colour !== null).map((c) => [c.documentId, c.colour as string]));

            return (
              <>
                <div className="flex flex-col gap-[var(--space-related)]">
                  <h1 className="font-[family-name:var(--font-display)] text-[length:var(--text-display)] font-extrabold">Bonjour, Léa</h1>
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

                <TodosCard todos={view.todos} courseColourByDocumentId={courseColourByDocumentId} />
              </>
            );
          })()}
        </main>

        <div className="flex w-[300px] shrink-0 flex-col gap-[var(--space-section)]">
          <PomodoroCard />
          <StudySoundsCard />
        </div>
      </div>
    </div>
  );
}
