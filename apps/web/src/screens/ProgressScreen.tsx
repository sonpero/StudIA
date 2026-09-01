import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CalendarClock } from "lucide-react";
import { useState } from "react";
import { Confused } from "../components/mascot/Confused.js";
import { Idle } from "../components/mascot/Idle.js";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { todayDateKey } from "../lib/day-boundary.js";
import { ICON_SIZE_INLINE, ICON_STROKE_WIDTH } from "../lib/icons.js";
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

// A neutral progress device (docs/UI.md's Progress section): a --primary
// bar over --border, the real number always visible next to it — never a
// bare bar, never the course's own subject colour. role="meter" carries
// the value to 2 decimal places, not the whole-point precision of the
// display text: a small genuine change (e.g. one card's worth of a
// 60-notion course) can round to the same whole percent, and a test
// reading aria-valuenow to detect a real rise needs enough resolution to
// see it even then.
function Gauge({ label, value }: { label: string; value: number }) {
  const precise = Math.round(value * 10_000) / 100;
  return (
    <div className="flex flex-col gap-1" role="meter" aria-label={label} aria-valuenow={precise} aria-valuemin={0} aria-valuemax={100} aria-valuetext={percent(value)}>
      {/* The percentage is the useful fact here (docs/UI.md's Type note):
          dominant on its own line, the label small and muted above it,
          not sharing a row at the same size as before. */}
      <span className="text-[length:var(--text-label)] text-text-muted">{label}</span>
      <span className="font-[family-name:var(--font-display)] text-[length:var(--text-display)] font-extrabold tabular-nums text-text">{percent(value)}</span>
      <div className="h-2 rounded-full bg-border">
        <div data-testid="gauge-fill" className="h-2 rounded-full bg-primary" style={{ width: widthPercent(value) }} />
      </div>
    </div>
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

function CourseProgressCard({ item, onOpenCourse }: { item: ProgressListItem; onOpenCourse: (documentId: string) => void }) {
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

  const todayKey = todayDateKey();
  const isToday = item.deadlineDate === todayKey;
  const isPast = item.progress.status === "deadline-in-past";
  const dataStatus = isPast ? "deadline-in-past" : isToday ? "today" : item.progress.status;

  return (
    <Card
      className="flex flex-col gap-3 border-l-4"
      style={{ borderLeftColor: item.colour }}
      data-testid="progress-card"
      data-status={dataStatus}
    >
      <h3 className="font-[family-name:var(--font-display)] text-[length:var(--text-title)] font-extrabold">{item.title}</h3>

      {/* A lapsed deadline is one more fact about the course, never a
          takeover of the whole card (docs/UI.md's Progression note): the
          gauges below render exactly as they do on any other card. The
          message leads, before both gauges, since it's the most pressing
          fact on the card — weight and position carry the emphasis, never
          colour: font-semibold, full-strength text (not muted), the same
          text-sm as everything else here. No box: the border-warning/
          bg-warning/10 treatment this used to carry measured ~1.8:1
          against the card's white background, under the 3:1 floor, and
          was retired rather than patched. */}
      {isPast && <p className="text-sm font-semibold text-text">Cette échéance est passée.</p>}

      {/* --space-block (16px) between the two gauges, not the card's
          own 12px rhythm used everywhere else on it (docs/UI.md's
          Progression note): title→gauge is buffered by the gauge's own
          label, but gauge→gauge puts a bar directly against a bare
          label with nothing between two 32px numbers — checked against
          real sizes, not assumed from the general rule alone. */}
      <div className="flex flex-col gap-[var(--space-block)]">
        <Gauge label="Couverture" value={item.progress.coverage} />
        <Gauge label="Préparation" value={item.progress.readiness} />
      </div>

      {item.progress.recentlyAddedUnreviewed > 0 && (
        <p className="text-sm text-text-muted">
          {/* recentlyAddedUnreviewed counts notions (compute-progress.ts),
              never cards — the two units coexist elsewhere in the app
              (e.g. TodayScreen's "fiches à revoir") and must not blur here. */}
          {item.progress.recentlyAddedUnreviewed} notion{item.progress.recentlyAddedUnreviewed > 1 ? "s" : ""} ajoutée
          {item.progress.recentlyAddedUnreviewed > 1 ? "s" : ""} récemment n'ont pas encore été travaillées.
        </p>
      )}

      {isPast ? null : item.deadlineDate === null ? (
        <p className="text-sm text-text-muted">Aucune échéance pour l'instant.</p>
      ) : isToday ? (
        <p className="text-sm text-text-muted">C'est aujourd'hui.</p>
      ) : (
        <p className="text-sm">
          Contrôle dans {daysUntil(item.deadlineDate, todayKey)} jour{daysUntil(item.deadlineDate, todayKey) > 1 ? "s" : ""}
          {item.progress.status === "behind" && item.progress.behindByNotions > 0 && (
            // Same weight as the rest of the card's text (docs/UI.md: a
            // fact stated soberly, not the loudest element on the card):
            // no box, no underline. --warning as a text colour is
            // available but not used here on purpose — at body size it
            // fails AA contrast against the card's background (~1.8:1,
            // well under the 3:1 floor for UI-sized text), so this stays
            // in the card's own default text colour instead.
            <span className="ml-1">
              {item.progress.behindByNotions} notion{item.progress.behindByNotions > 1 ? "s" : ""} à consolider avant l'échéance
            </span>
          )}
        </p>
      )}

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
            {/* No separate "Mettre à jour" wording for a lapsed deadline
                (docs/UI.md's Progression note): the message above already
                says it's stale, and a first attempt at a distinct label
                wrapped to two lines paired with "Supprimer l'échéance" at
                this card's real column width — "Modifier l'échéance" fits
                on one, reused as-is from the upcoming-deadline case. */}
            {item.deadlineDate === null ? "Définir une échéance" : "Modifier l'échéance"}
          </Button>
          {/* Reused as-is, the same plain --text-muted underlined link
              "Supprimer" already uses everywhere else in this app
              (docs/UI.md's destructive-actions note): no colour, no
              confirmation modal — low visual weight already tells the
              story. Previously only reachable once a deadline was still
              upcoming; a lapsed one (item.deadlineDate !== null here too)
              had no way to be removed at all. */}
          {item.deadlineDate !== null && (
            <button type="button" className="text-sm text-text-muted underline" onClick={() => deleteDeadlineMutation.mutate()}>
              Supprimer l'échéance
            </button>
          )}
        </div>
      )}

      {/* Always visible, independent of editing state or status: symmetric to
          Aujourd'hui's own course-card action (TodayScreen's CourseTodayCard).
          "Voir le cours" never collides with the nav's "Progression" item —
          the mistake made once on NotionsScreen's own button to this same
          screen, avoided there by spelling out the full phrase. */}
      <Button variant="secondary" onClick={() => onOpenCourse(item.documentId)}>
        <BookOpen aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
        Voir le cours
      </Button>
    </Card>
  );
}

export function ProgressScreen({ onBack, onOpenCourse }: { onBack: () => void; onOpenCourse: (documentId: string) => void }) {
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: listProgress });

  if (query.status === "pending") {
    return (
      <main className="flex flex-col gap-[var(--space-section)] p-8">
        <div className="flex items-center justify-between">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Progression</h1>
          <button type="button" className="text-sm text-text-muted underline" onClick={onBack}>
            Retour
          </button>
        </div>
        <div className="grid grid-cols-1 gap-[var(--space-block)] sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-[var(--radius-card)] bg-border" />
          ))}
        </div>
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

  return (
    <main className="flex flex-col gap-[var(--space-section)] p-8">
      <div className="flex items-center justify-between">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Progression</h1>
        <button type="button" className="text-sm text-text-muted underline" onClick={onBack}>
          Retour
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <Idle />
          <p>Aucun cours pour l'instant. Prends ton cours en photo pour commencer.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-[var(--space-block)] sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <CourseProgressCard key={item.documentId} item={item} onOpenCourse={onOpenCourse} />
          ))}
        </div>
      )}
    </main>
  );
}
