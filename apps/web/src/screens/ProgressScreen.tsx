import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BookOpen, CalendarClock, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Confused } from "../components/mascot/Confused.js";
import { Idle } from "../components/mascot/Idle.js";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { todayDateKey } from "../lib/day-boundary.js";
import { ICON_SIZE_INLINE, ICON_STROKE_WIDTH } from "../lib/icons.js";
import { getNotionsProgress, listNotions, type NotionProgress } from "../lib/notions-api.js";
import { deleteDeadline, listProgress, setDeadline, type ProgressListItem } from "../lib/progress-api.js";

const QUERY_KEY = ["progress-list"];

function daysUntil(dateKey: string, todayKey: string): number {
  const a = new Date(`${todayKey}T00:00:00.000Z`).getTime();
  const b = new Date(`${dateKey}T00:00:00.000Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function percent(value: number): string {
  return `${Math.round(value * 100)} %`;
}

// percent()'s narrow space before "%" (French typography) is invalid inside
// a CSS <percentage> token — cssstyle/browsers silently drop the whole
// declaration rather than parse "71 %", leaving width unset and the bar
// rendering at its parent's full size regardless of value. A bare number's
// worth of width, with no space, for style only; percent() stays the display
// and aria-valuetext string.
function widthPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

// The dominant, --text-display gauge used on the detail card — one course's
// own indicators only, so unlike the compact list row's own bar (below), a
// mismatch of scale is never a risk here.
function Gauge({ label, value, colour }: { label: string; value: number; colour: string }) {
  const precise = Math.round(value * 10_000) / 100;
  return (
    <div className="flex flex-col gap-1" role="meter" aria-label={label} aria-valuenow={precise} aria-valuemin={0} aria-valuemax={100} aria-valuetext={percent(value)}>
      <span className="text-[length:var(--text-label)] text-text-muted">{label}</span>
      <span className="font-[family-name:var(--font-display)] text-[length:var(--text-display)] font-extrabold tabular-nums text-text">{percent(value)}</span>
      <div className="h-2 rounded-full bg-border">
        {/* Deliberately the selected course's own colour, not --primary — a
            reversal of docs/UI.md's former "subject colours are for
            identity only, never progress or state" rule, per the user's
            explicit instruction for this screen. */}
        <div data-testid="gauge-fill" className="h-2 rounded-full" style={{ width: widthPercent(value), backgroundColor: colour }} />
      </div>
    </div>
  );
}

// The compact bar used on each "All courses" row: label and percentage share
// one line, a thinner fill beneath — a full --text-display number here would
// dominate a list meant to be scanned quickly, not read one course at a time.
function CompactBar({ label, value, colour }: { label: string; value: number; colour: string }) {
  const precise = Math.round(value * 10_000) / 100;
  return (
    <div className="flex flex-col gap-1" role="meter" aria-label={label} aria-valuenow={precise} aria-valuemin={0} aria-valuemax={100} aria-valuetext={percent(value)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-muted">{label}</span>
        <span className="tabular-nums text-text">{percent(value)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-border">
        <div data-testid="gauge-fill" className="h-1.5 rounded-full" style={{ width: widthPercent(value), backgroundColor: colour }} />
      </div>
    </div>
  );
}

// A decorative ring duplicating the readiness number the linear "Préparation"
// gauge below already exposes with role="meter" — this SVG stays
// aria-hidden rather than being a second accessible meter with the same
// name, avoiding an ambiguous duplicate for both assistive tech and tests.
function ReadinessRing({ value, colour }: { value: number; colour: string }) {
  const size = 140;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value);
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-border)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={colour}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-[family-name:var(--font-display)] text-[length:var(--text-display)] font-extrabold tabular-nums text-text">{percent(value)}</span>
          <span className="text-[length:var(--text-label)] text-text-muted">prêt</span>
        </div>
      </div>
      <span className="text-sm text-text-muted">Préparation à l'examen</span>
    </div>
  );
}

function StatTile({ value, label, dataTestId }: { value: number | null; label: string; dataTestId: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-[var(--radius-button)] bg-canvas py-3 text-center" data-testid={dataTestId}>
      {value === null ? (
        <div className="h-7 w-6 animate-pulse rounded bg-border" />
      ) : (
        <span className="font-[family-name:var(--font-display)] text-xl font-extrabold tabular-nums text-text">{value}</span>
      )}
      <span className="text-[length:var(--text-label)] text-text-muted">{label}</span>
    </div>
  );
}

// Same idiom as NotionsScreen/ReaderScreen's own CoursePill, kept local
// rather than shared — small enough that importing it across screens would
// cost more than it saves.
function CoursePill({ item, active, onSelect }: { item: ProgressListItem; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onSelect}
      className={`flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition-colors ${
        active ? "border-transparent bg-primary text-white" : "border-border bg-surface text-text hover:bg-canvas"
      }`}
    >
      <BookOpen aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} color={active ? "#fff" : item.colour} />
      {item.title}
    </button>
  );
}

// A course's own icon in a colour-tinted circle, not the left-border
// treatment docs/UI.md used to describe for this screen specifically — the
// same departure Aujourd'hui/Mes cours already made from their own
// mockups, extended here to a third screen.
function CourseIcon({ colour }: { colour: string }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${colour}26` }}>
      <BookOpen aria-hidden="true" focusable="false" size={20} strokeWidth={ICON_STROKE_WIDTH} color={colour} />
    </span>
  );
}

function DeadlineForm({ initialDate, initialLabel, onSubmit, onCancel, pending }: { initialDate: string; initialLabel: string; onSubmit: (date: string, label: string) => void; onCancel: () => void; pending: boolean }) {
  const [date, setDate] = useState(initialDate);
  const [label, setLabel] = useState(initialLabel);

  return (
    <form
      className="flex flex-col gap-2 rounded-[var(--radius-button)] bg-canvas p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(date, label);
      }}
    >
      <label className="flex flex-col gap-1 text-sm text-text-muted">
        Date
        <input type="date" required className="rounded-[var(--radius-button)] border border-border bg-surface p-2 text-text" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-text-muted">
        Intitulé (facultatif)
        <input
          type="text"
          placeholder="Contrôle de maths"
          className="rounded-[var(--radius-button)] border border-border bg-surface p-2 text-text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || !date}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

type Bucket = "mastered" | "due" | "learning" | "not-started";

// Mastery wins even over a technically-due card, the same precedent
// NotionsScreen's own notionStatus already sets — a notion with zero cards
// falls into its own "not-started" bucket here rather than being folded
// into "learning" the way NotionsScreen's badge does (this screen's own
// four-way stat row has room to distinguish it; that screen's badge does
// not).
function notionBucket(progress: NotionProgress | undefined): Bucket {
  if (!progress || progress.totalCards === 0) return "not-started";
  if (progress.masteredCards === progress.totalCards) return "mastered";
  if (progress.dueNow) return "due";
  return "learning";
}

// The selected course's own detail card: a readiness ring, the two
// coloured gauges, the four-way notion stat row, deadline messaging/
// management, and the "Combler l'écart" / "Voir le cours" actions. Kept as
// its own component so switching the pill selection key-remounts it,
// resetting the deadline form's own local editing state instead of leaking
// it from the previously-selected course.
function ProgressDetailCard({ item, onOpenCourse, onReview }: { item: ProgressListItem; onOpenCourse: (documentId: string) => void; onReview: (documentId: string) => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const setDeadlineMutation = useMutation({
    mutationFn: (input: { date: string; label: string }) => setDeadline(item.documentId, input.date, input.label.trim() || undefined),
    onSuccess: () => {
      setEditing(false);
      refresh();
    },
  });
  const deleteDeadlineMutation = useMutation({ mutationFn: () => deleteDeadline(item.documentId), onSuccess: refresh });

  const notionsQuery = useQuery({ queryKey: ["notions", item.documentId], queryFn: () => listNotions(item.documentId) });
  const notionsProgressQuery = useQuery({ queryKey: ["notions-progress", item.documentId], queryFn: () => getNotionsProgress(item.documentId) });
  const statsLoading = notionsQuery.status === "pending" || notionsProgressQuery.status === "pending";
  const statsErrored = notionsQuery.status === "error" || notionsProgressQuery.status === "error";

  const buckets: Record<Bucket, number> = { mastered: 0, due: 0, learning: 0, "not-started": 0 };
  if (notionsQuery.data && notionsProgressQuery.data) {
    for (const notion of notionsQuery.data) {
      const progress = notionsProgressQuery.data.find((row) => row.notionId === notion.id);
      buckets[notionBucket(progress)] += 1;
    }
  }
  const dueCount = buckets.due;

  const todayKey = todayDateKey();
  const isToday = item.deadlineDate === todayKey;
  const isPast = item.progress.status === "deadline-in-past";
  const dataStatus = isPast ? "deadline-in-past" : isToday ? "today" : item.progress.status;

  return (
    <Card className="flex flex-col gap-[var(--space-section)]" data-testid="progress-detail-card" data-status={dataStatus}>
      <div className="flex items-start gap-[var(--space-related)]">
        <CourseIcon colour={item.colour} />
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-[length:var(--text-title)] font-extrabold">{item.title}</h2>

          {/* A lapsed deadline is one more fact about the course, never a
              takeover of the whole card (docs/UI.md's Progression note):
              the gauges below render exactly as they do on any other
              card. Weight and position carry the emphasis, never colour. */}
          {isPast && <p className="text-sm font-semibold text-text">Cette échéance est passée.</p>}

          {isPast ? null : item.deadlineDate === null ? (
            <p className="text-sm text-text-muted">Aucune échéance pour l'instant.</p>
          ) : isToday ? (
            <p className="text-sm text-text-muted">C'est aujourd'hui.</p>
          ) : (
            <p className="text-sm text-text-muted">
              Contrôle dans {daysUntil(item.deadlineDate, todayKey)} jour{daysUntil(item.deadlineDate, todayKey) > 1 ? "s" : ""}
              {item.progress.status === "behind" && item.progress.behindByNotions > 0 && (
                <span className="ml-1 text-text">
                  · {item.progress.behindByNotions} notion{item.progress.behindByNotions > 1 ? "s" : ""} à consolider avant l'échéance
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {item.progress.recentlyAddedUnreviewed > 0 && (
        <p className="text-sm text-text-muted">
          {item.progress.recentlyAddedUnreviewed} notion{item.progress.recentlyAddedUnreviewed > 1 ? "s" : ""} ajoutée
          {item.progress.recentlyAddedUnreviewed > 1 ? "s" : ""} récemment n'ont pas encore été travaillées.
        </p>
      )}

      <div className="flex flex-col items-center gap-[var(--space-section)] sm:flex-row sm:items-center">
        <ReadinessRing value={item.progress.readiness} colour={item.colour} />
        <div className="flex w-full flex-1 flex-col gap-[var(--space-block)]">
          <Gauge label="Couverture" value={item.progress.coverage} colour={item.colour} />
          <Gauge label="Préparation" value={item.progress.readiness} colour={item.colour} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile dataTestId="stat-mastered" value={statsLoading ? null : statsErrored ? 0 : buckets.mastered} label="Maîtrisées" />
        <StatTile dataTestId="stat-learning" value={statsLoading ? null : statsErrored ? 0 : buckets.learning} label="En apprentissage" />
        <StatTile dataTestId="stat-due" value={statsLoading ? null : statsErrored ? 0 : buckets.due} label="À réviser" />
        <StatTile dataTestId="stat-not-started" value={statsLoading ? null : statsErrored ? 0 : buckets["not-started"]} label="Non commencées" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {dueCount > 0 ? (
          <Button variant="accent" className="rounded-2xl" onClick={() => onReview(item.documentId)}>
            Combler l'écart
            <ArrowRight aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
          </Button>
        ) : (
          <Button variant="secondary" className="rounded-2xl" disabled>
            Rien à réviser
          </Button>
        )}
        <Button variant="secondary" onClick={() => onOpenCourse(item.documentId)}>
          <BookOpen aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
          Voir le cours
        </Button>
      </div>

      {editing ? (
        <DeadlineForm
          initialDate={isPast ? "" : (item.deadlineDate ?? "")}
          initialLabel={item.deadlineLabel ?? ""}
          pending={setDeadlineMutation.isPending}
          onSubmit={(date, label) => setDeadlineMutation.mutate({ date, label })}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <CalendarClock aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
            {item.deadlineDate === null ? "Définir une échéance" : "Modifier l'échéance"}
          </Button>
          {item.deadlineDate !== null && (
            <button type="button" className="text-sm text-text-muted underline" onClick={() => deleteDeadlineMutation.mutate()}>
              Supprimer l'échéance
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

function CourseListRow({ item, active, onSelect }: { item: ProgressListItem; active: boolean; onSelect: () => void }) {
  const todayKey = todayDateKey();
  const isPast = item.progress.status === "deadline-in-past";
  const isToday = item.deadlineDate === todayKey;
  const deadlineSentence =
    item.deadlineDate === null
      ? "Aucune échéance"
      : isPast
        ? "Échéance passée"
        : isToday
          ? "C'est aujourd'hui"
          : `Contrôle dans ${daysUntil(item.deadlineDate, todayKey)} jour${daysUntil(item.deadlineDate, todayKey) > 1 ? "s" : ""}`;

  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid="progress-list-row"
      className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 text-left transition-colors hover:bg-canvas sm:flex-row sm:items-center sm:gap-[var(--space-related)]"
      style={active ? { borderLeftWidth: 4, borderLeftColor: item.colour } : undefined}
    >
      <div className="flex items-center gap-[var(--space-related)] sm:w-56 sm:shrink-0">
        <CourseIcon colour={item.colour} />
        <div>
          <h3 className="font-[family-name:var(--font-display)] text-sm font-extrabold text-text">{item.title}</h3>
          <p className="text-[length:var(--text-label)] text-text-muted">{deadlineSentence}</p>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <CompactBar label="Couverture" value={item.progress.coverage} colour={item.colour} />
        <CompactBar label="Préparation" value={item.progress.readiness} colour={item.colour} />
      </div>
    </button>
  );
}

export function ProgressScreen({
  documentId,
  onBack,
  onOpenCourse,
  onReview,
}: {
  documentId?: string;
  onBack: () => void;
  onOpenCourse: (documentId: string) => void;
  onReview: (documentId: string) => void;
}) {
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: listProgress });
  const [manualSelection, setManualSelection] = useState<string | undefined>(undefined);

  if (query.status === "pending") {
    return (
      <main className="flex flex-col gap-[var(--space-section)] p-8">
        <div className="flex items-center justify-between">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Progression</h1>
          <button type="button" className="text-sm text-text-muted underline" onClick={onBack}>
            Retour
          </button>
        </div>
        <div className="h-56 animate-pulse rounded-[var(--radius-card)] bg-border" />
      </main>
    );
  }

  if (query.status === "error") {
    return (
      <main className="flex flex-col items-center gap-[var(--space-section)] p-8 text-center">
        <Confused />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Progression</h1>
        <p>Impossible de charger ta progression. Vérifie ta connexion et réessaie.</p>
        <Button onClick={() => void query.refetch()}>Réessayer</Button>
      </main>
    );
  }

  const items = query.data;

  if (items.length === 0) {
    return (
      <main className="flex flex-col gap-[var(--space-section)] p-8">
        <div className="flex items-center justify-between">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Progression</h1>
          <button type="button" className="text-sm text-text-muted underline" onClick={onBack}>
            Retour
          </button>
        </div>
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <Idle />
          <p>Aucun cours pour l'instant. Prends ton cours en photo pour commencer.</p>
        </div>
      </main>
    );
  }

  const selectedId = documentId ?? manualSelection ?? items[0]!.documentId;
  const selectedItem = items.find((item) => item.documentId === selectedId) ?? items[0]!;

  return (
    <main className="flex flex-col gap-[var(--space-section)] p-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Progression</h1>
          <p className="text-sm text-text-muted">Ta préparation pour chaque examen, et la part de ton programme déjà couverte.</p>
        </div>
        <button type="button" className="text-sm text-text-muted underline" onClick={onBack}>
          Retour
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <CoursePill key={item.documentId} item={item} active={item.documentId === selectedItem.documentId} onSelect={() => setManualSelection(item.documentId)} />
        ))}
      </div>

      <ProgressDetailCard key={selectedItem.documentId} item={selectedItem} onOpenCourse={onOpenCourse} onReview={onReview} />

      <div className="flex flex-col gap-[var(--space-related)]">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text-muted">
          <TrendingUp aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
          Tous les cours
        </h2>
        <div className="flex flex-col gap-[var(--space-block)]">
          {items.map((item) => (
            <CourseListRow key={item.documentId} item={item} active={item.documentId === selectedItem.documentId} onSelect={() => setManualSelection(item.documentId)} />
          ))}
        </div>
      </div>
    </main>
  );
}
