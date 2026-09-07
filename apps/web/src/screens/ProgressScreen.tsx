import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BookOpen, CalendarClock, Trash2, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
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

// Every indicator on this screen loads from 0 to its real value, per a
// follow-up mockup — a deliberate motion addition, not covered by
// docs/UI.md's own Motion section (150-200ms ease-out, "the review card
// flip is the one orchestrated moment"), reconciled there alongside this
// note. A CSS transition needs two distinct rendered states to animate
// between: this hook renders `false` on the first paint (0 width/full
// offset, the "empty" state), then flips to `true` in a plain (not layout)
// effect — deferred until after that first paint, exactly the gap the
// transition needs — triggering the real value's own paint as a second,
// transitioned frame. `motion-reduce:transition-none` on each animated
// element (not here) respects a reduced-motion preference, jumping
// straight to the real value instead.
function useEnterAnimation(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  return ready;
}

const GAUGE_TRANSITION = "transition-[width] duration-700 ease-out motion-reduce:transition-none";

// The dominant, --text-display gauge used on the detail card — one course's
// own indicators only, so unlike the compact list row's own bar (below), a
// mismatch of scale is never a risk here.
function Gauge({ label, value, colour }: { label: string; value: number; colour: string }) {
  const precise = Math.round(value * 10_000) / 100;
  const ready = useEnterAnimation();
  return (
    <div className="flex flex-col gap-1" role="meter" aria-label={label} aria-valuenow={precise} aria-valuemin={0} aria-valuemax={100} aria-valuetext={percent(value)}>
      <span className="text-[length:var(--text-label)] text-text-muted">{label}</span>
      <span className="font-[family-name:var(--font-display)] text-[length:var(--text-display)] font-extrabold tabular-nums text-text">{percent(value)}</span>
      <div className="h-2 rounded-full bg-border">
        {/* Deliberately the selected course's own colour, not --primary — a
            reversal of docs/UI.md's former "subject colours are for
            identity only, never progress or state" rule, per the user's
            explicit instruction for this screen. */}
        <div data-testid="gauge-fill" className={`h-2 rounded-full ${GAUGE_TRANSITION}`} style={{ width: ready ? widthPercent(value) : "0%", backgroundColor: colour }} />
      </div>
    </div>
  );
}

// The compact bar used on each "All courses" row: label and percentage share
// one line, a thinner fill beneath — a full --text-display number here would
// dominate a list meant to be scanned quickly, not read one course at a time.
function CompactBar({ label, value, colour }: { label: string; value: number; colour: string }) {
  const precise = Math.round(value * 10_000) / 100;
  const ready = useEnterAnimation();
  return (
    <div className="flex flex-col gap-1" role="meter" aria-label={label} aria-valuenow={precise} aria-valuemin={0} aria-valuemax={100} aria-valuetext={percent(value)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-muted">{label}</span>
        <span className="tabular-nums text-text">{percent(value)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-border">
        <div data-testid="gauge-fill" className={`h-1.5 rounded-full ${GAUGE_TRANSITION}`} style={{ width: ready ? widthPercent(value) : "0%", backgroundColor: colour }} />
      </div>
    </div>
  );
}

// The ring's own outer width (ReadinessRing, below) — shared with
// RingSpacer so the header and the lower block (stat tiles, actions) can
// each reserve exactly the ring's own column width without duplicating
// the number, even though neither of them shares a row with the ring
// itself any more (a second follow-up mockup moved the ring down to sit
// between "Couverture" and "Préparation" instead of spanning the header).
const RING_SIZE = 140;

// An invisible column-width spacer, sm+ only (everything stacks full-width
// below that breakpoint, the ring included) — keeps the header and the
// lower block's own left edge aligned with the bars' own "Couverture"
// label without either of them needing to share a row with the ring.
function RingSpacer() {
  return <div className="hidden shrink-0 sm:block sm:w-[140px]" aria-hidden="true" data-testid="progress-ring-spacer" />;
}

// A decorative ring duplicating the readiness number the linear "Préparation"
// gauge below already exposes with role="meter" — this SVG stays
// aria-hidden rather than being a second accessible meter with the same
// name, avoiding an ambiguous duplicate for both assistive tech and tests.
function ReadinessRing({ value, colour }: { value: number; colour: string }) {
  const size = RING_SIZE;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value);
  const ready = useEnterAnimation();
  return (
    <div className="flex shrink-0 flex-col items-center gap-1" data-testid="progress-ring-column">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-border)" strokeWidth={stroke} />
          <circle
            data-testid="ring-fill"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={colour}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={ready ? offset : circumference}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
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
      {/* The header reserves the ring's own column width with an
          invisible spacer rather than sharing a row with it — a second
          follow-up mockup moved the ring down to sit between "Couverture"
          and "Préparation" instead of spanning the header's own row, so
          the header can no longer align with the bars by sharing a flex
          row with the ring the way this pass's first cut did. */}
      <div className="flex flex-col gap-[var(--space-section)] sm:flex-row sm:items-start">
        <RingSpacer />
        <div className="flex w-full flex-1 flex-col gap-[var(--space-section)]">
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
        </div>
      </div>

      {/* The ring's own row: just the ring and the two gauges,
          vertically centred against each other so the ring lands between
          "Couverture" and "Préparation" — the realignment itself. */}
      <div className="flex flex-col items-center gap-[var(--space-section)] sm:flex-row sm:items-center">
        <ReadinessRing value={item.progress.readiness} colour={item.colour} />
        <div className="flex w-full flex-1 flex-col gap-[var(--space-block)]" data-testid="progress-detail-body">
          <Gauge label="Couverture" value={item.progress.coverage} colour={item.colour} />
          <Gauge label="Préparation" value={item.progress.readiness} colour={item.colour} />
        </div>
      </div>

      {/* The lower block (stat tiles, actions) reserves the same spacer
          width so it aligns with "Couverture" too, leaving the space
          beneath the ring empty rather than stretching under it. */}
      <div className="flex flex-col gap-[var(--space-section)] sm:flex-row sm:items-start">
        <RingSpacer />
        <div className="flex w-full flex-1 flex-col gap-[var(--space-section)]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile dataTestId="stat-mastered" value={statsLoading ? null : statsErrored ? 0 : buckets.mastered} label="Maîtrisées" />
            <StatTile dataTestId="stat-learning" value={statsLoading ? null : statsErrored ? 0 : buckets.learning} label="En apprentissage" />
            <StatTile dataTestId="stat-due" value={statsLoading ? null : statsErrored ? 0 : buckets.due} label="À réviser" />
            <StatTile dataTestId="stat-not-started" value={statsLoading ? null : statsErrored ? 0 : buckets["not-started"]} label="Non commencées" />
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
            // "Modifier l'échéance" and the delete icon now share this row
            // with "Combler l'écart"/"Voir le cours" instead of their own
            // row below — a follow-up mockup's own request.
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
              {/* Same secondary-with-tint idiom as Lecteur's "Discuter avec
                  le tuteur" and Mes cours' "Lire le cours"
                  (DocumentsScreen.tsx) — a light green wash, not the plain
                  bordered secondary either button used to be, per a
                  follow-up mockup (this one twice: first "Voir le cours",
                  then "Modifier l'échéance" too). */}
              <Button variant="secondary" className="border-transparent bg-primary-soft text-primary hover:bg-primary-soft" onClick={() => onOpenCourse(item.documentId)}>
                <BookOpen aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
                Voir le cours
              </Button>
              <Button variant="secondary" className="border-transparent bg-primary-soft text-primary hover:bg-primary-soft" onClick={() => setEditing(true)}>
                <CalendarClock aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
                {item.deadlineDate === null ? "Définir une échéance" : "Modifier l'échéance"}
              </Button>
              {item.deadlineDate !== null && (
                // A trash icon, not the text link this used to be, per a
                // follow-up mockup — the accessible name stays "Supprimer
                // l'échéance" via aria-label (Forbidden's own "icon-only
                // button without an accessible label" rule, above), still
                // the same low-visual-weight treatment every other
                // destructive action in this app uses, an icon instead of
                // underlined text.
                <button
                  type="button"
                  aria-label="Supprimer l'échéance"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-button)] text-text-muted hover:bg-canvas hover:text-text"
                  onClick={() => deleteDeadlineMutation.mutate()}
                >
                  <Trash2 aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
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
