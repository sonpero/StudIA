import {
  ArrowRight,
  BookOpen,
  BookOpenText,
  Calendar,
  Check,
  Clock,
  Feather,
  Flame,
  GraduationCap,
  Home,
  Landmark,
  Layers,
  Leaf,
  ListChecks,
  MessageCircle,
  Music,
  Play,
  Plus,
  RotateCcw,
  Sigma,
  SkipBack,
  SkipForward,
  Timer,
  TrendingUp,
  Volume2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { ICON_SIZE_INLINE, ICON_SIZE_NAV, ICON_STROKE_WIDTH } from "../lib/icons.js";

// Front-end prototype, approved from a design mockup (see the reviewed
// artifact) — not yet wired to any real endpoint and not yet reachable
// from App.tsx's own routing (a deliberate choice: it must not show mock
// data to a real user on the live "Aujourd'hui" destination). Every value
// below is hardcoded; wiring each section to its real data source is
// future, incremental work, one piece at a time.
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

type MockCourseCard = {
  id: string;
  subject: string;
  title: string;
  icon: LucideIcon;
  // A real hex from the app's own subject palette (packages/core/src/
  // ingestion/domain/colour.ts), used at reduced opacity for the icon's
  // tinted circle — not an invented colour, docs/UI.md's Colour note.
  colour: string;
  dueCount: number | null; // null: all caught up
  examInDays: number;
};

const MOCK_COURSES: MockCourseCard[] = [
  { id: "c1", subject: "Biologie", title: "Biologie cellulaire et génétique", icon: Leaf, colour: "#109da0", dueCount: 12, examInDays: 8 },
  { id: "c2", subject: "Histoire", title: "La Révolution française", icon: Landmark, colour: "#f36016", dueCount: 7, examInDays: 4 },
  { id: "c3", subject: "Mathématiques", title: "Fonctions quadratiques", icon: Sigma, colour: "#0897d6", dueCount: null, examInDays: 17 },
  { id: "c4", subject: "Littérature française", title: "Le Père Goriot", icon: Feather, colour: "#ec4899", dueCount: 5, examInDays: 11 },
];

// "aujourd'hui"/"demain" at 0/1, matching the real countdown badge
// already shipped on Aujourd'hui's course cards (docs/UI.md's Aujourd'hui
// — deadline note) — reused here for consistency, not reinvented.
function countdownLabel(daysAway: number): string {
  if (daysAway === 0) return "Examen aujourd'hui";
  if (daysAway === 1) return "Examen demain";
  return `Examen dans ${daysAway} jours`;
}

type MockTodo = {
  id: string;
  label: string;
  done: boolean;
  dueDate: string | null;
  dotColour: string;
};

const MOCK_TODOS: MockTodo[] = [
  { id: "t1", label: "Réviser les 12 fiches de Biologie dues aujourd'hui", done: false, dueDate: null, dotColour: "#109da0" },
  { id: "t2", label: "Lire la notion « La Terreur »", done: false, dueDate: "8 septembre 2026", dotColour: "#f36016" },
  { id: "t3", label: "Demander au tuteur les carrés de Punnett", done: true, dueDate: null, dotColour: "#109da0" },
  { id: "t4", label: "Terminer 3 exercices sur les fonctions quadratiques", done: false, dueDate: "10 septembre 2026", dotColour: "#0897d6" },
  { id: "t5", label: "Parcourir le guide d'étude Balzac, pages 4-8", done: false, dueDate: "12 septembre 2026", dotColour: "#ec4899" },
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
          // The only piece actually wired so far (docs comment on Today()
          // below): "Aujourd'hui" returns to the real app. Every other
          // item stays a static row until its own screen exists here.
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

function CourseCard({ course }: { course: MockCourseCard }) {
  const Icon = course.icon;
  return (
    <Card className="flex flex-col gap-[var(--space-block)]" data-testid="course-today-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-[var(--space-related)]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${course.colour}26` }}>
            <Icon aria-hidden="true" focusable="false" size={18} strokeWidth={ICON_STROKE_WIDTH} color={course.colour} />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="text-[length:var(--text-label)] text-text-muted">{course.subject}</span>
            <span className="truncate font-[family-name:var(--font-display)] text-sm font-bold">{course.title}</span>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[length:var(--text-label)] font-semibold whitespace-nowrap text-warning">
          <Clock aria-hidden="true" focusable="false" size={12} strokeWidth={ICON_STROKE_WIDTH} />
          {countdownLabel(course.examInDays)}
        </span>
      </div>

      {course.dueCount !== null ? (
        <p>
          <span className="font-[family-name:var(--font-display)] text-[length:var(--text-display)] font-extrabold tabular-nums">{course.dueCount}</span>{" "}
          <span className="text-sm text-text-muted">fiches à revoir</span>
        </p>
      ) : (
        <p className="flex items-center gap-[var(--space-related)] text-sm font-semibold text-success">
          <Check aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
          Tout est à jour
        </p>
      )}

      {course.dueCount !== null ? (
        <Button variant="accent" className="w-full justify-center">
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

function TodosCard() {
  const remaining = MOCK_TODOS.filter((t) => !t.done).length;
  return (
    <Card className="flex flex-col gap-[var(--space-block)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-[var(--space-related)] text-sm font-semibold">
          <ListChecks aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
          Todos
        </div>
        <div className="flex items-center gap-[var(--space-related)]">
          <span className="text-[length:var(--text-label)] text-text-muted">{remaining} restants</span>
          <button
            type="button"
            aria-label="Ajouter un todo"
            className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-soft text-primary"
          >
            <Plus aria-hidden="true" focusable="false" size={14} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      <ul className="flex flex-col gap-[var(--space-block)]">
        {MOCK_TODOS.map((todo) => (
          <li key={todo.id} data-testid="today-todo-row" className="flex items-center gap-[var(--space-related)]">
            <input type="checkbox" checked={todo.done} readOnly aria-label={todo.label} className="h-[18px] w-[18px] shrink-0 accent-success" />
            <span className={todo.done ? "flex-1 text-sm text-text-muted line-through" : "flex-1 text-sm"}>{todo.label}</span>
            {todo.dueDate && <span className="whitespace-nowrap text-[length:var(--text-label)] text-text-muted">{todo.dueDate}</span>}
            <span aria-hidden="true" className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ backgroundColor: todo.dotColour }} />
            <button type="button" aria-label={`Supprimer « ${todo.label} »`} className="flex h-[18px] w-[18px] shrink-0 items-center justify-center text-text-muted hover:text-text">
              <X aria-hidden="true" focusable="false" size={13} strokeWidth={ICON_STROKE_WIDTH} />
            </button>
          </li>
        ))}
      </ul>
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

export function Today({ onExit }: { onExit?: () => void } = {}) {
  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar onExit={onExit} />

      <div className="flex flex-1 gap-[var(--space-section)] p-8">
        <main className="flex flex-1 flex-col gap-[var(--space-section)]">
          <div className="flex flex-col gap-[var(--space-related)]">
            <h1 className="font-[family-name:var(--font-display)] text-[length:var(--text-display)] font-extrabold">Bonjour, Léa</h1>
            <p className="text-sm text-text-muted">
              Tu as <strong className="font-semibold text-text">24 fiches</strong> à réviser dans 4 cours. 25 minutes de concentration suffisent pour garder de l'avance.
            </p>
          </div>

          <div className="flex flex-col gap-[var(--space-block)]">
            <div className="flex items-center gap-[var(--space-related)] text-sm font-semibold">
              <Calendar aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
              À réviser aujourd'hui
            </div>
            <div className="grid grid-cols-1 gap-[var(--space-block)] sm:grid-cols-2">
              {MOCK_COURSES.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          </div>

          <TodosCard />
        </main>

        <div className="flex w-[300px] shrink-0 flex-col gap-[var(--space-section)]">
          <PomodoroCard />
          <StudySoundsCard />
        </div>
      </div>
    </div>
  );
}
