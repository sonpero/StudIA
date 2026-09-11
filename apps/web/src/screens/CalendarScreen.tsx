import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Calendar as CalendarIcon, CalendarClock } from "lucide-react";
import { Confused } from "../components/mascot/Confused.js";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { getCalendar, type CalendarEntry } from "../lib/calendar-api.js";
import { buildMonthGrid, monthLabel, monthRange } from "../lib/calendar-month.js";
import { ICON_SIZE_INLINE, ICON_SIZE_NAV, ICON_STROKE_WIDTH } from "../lib/icons.js";
import { listProgress, type ProgressListItem } from "../lib/progress-api.js";
import { cn } from "../lib/utils.js";
import { todayDateKey } from "../lib/day-boundary.js";
import { countdownLabel } from "./TodayScreen.js";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const UPCOMING_DEADLINES_LIMIT = 4;
const UPCOMING_DEADLINE_DATE_FORMATTER = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

// Local, not shared — same idiom as ProgressScreen's own daysUntil: small
// enough that a shared helper would cost more than it saves.
function daysUntil(dateKey: string, todayKey: string): number {
  const a = new Date(`${todayKey}T00:00:00.000Z`).getTime();
  const b = new Date(`${dateKey}T00:00:00.000Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

// A day cell holds at most three tokens, always: up to three dots, or two
// dots plus a count (docs/UI.md's Calendrier note). Each dot's accessible
// name is the course title, resolved from documentId — never the colour
// alone, which is never the only carrier of meaning.
function DayDots({ entries, titleById }: { entries: CalendarEntry[]; titleById: Map<string, string> }) {
  if (entries.length === 0) return null;

  function dotLabel(entry: CalendarEntry): string {
    if (!entry.documentId) return "Todo sans cours";
    return titleById.get(entry.documentId) ?? entry.title;
  }

  function Dot({ entry }: { entry: CalendarEntry }) {
    return (
      <span
        role="img"
        aria-label={dotLabel(entry)}
        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", !entry.colour && "bg-text-muted")}
        style={entry.colour ? { backgroundColor: entry.colour } : undefined}
      />
    );
  }

  if (entries.length <= 3) {
    return (
      <span className="flex items-center gap-0.5">
        {entries.map((entry) => (
          <Dot key={entry.id} entry={entry} />
        ))}
      </span>
    );
  }

  const shown = entries.slice(0, 2);
  const remaining = entries.length - 2;
  return (
    <span className="flex items-center gap-0.5">
      {shown.map((entry) => (
        <Dot key={entry.id} entry={entry} />
      ))}
      <span className="text-[10px] font-medium text-text-muted" aria-label={`et ${remaining} de plus`}>
        +{remaining}
      </span>
    </span>
  );
}

function DayCell({
  dateKey,
  entries,
  titleById,
  isToday,
  isSelected,
  onSelect,
}: {
  dateKey: string;
  entries: CalendarEntry[];
  titleById: Map<string, string>;
  isToday: boolean;
  isSelected: boolean;
  onSelect: (dateKey: string) => void;
}) {
  const dayNumber = Number(dateKey.slice(8, 10));
  return (
    <button
      type="button"
      data-testid={`calendar-day-${dateKey}`}
      aria-current={isToday ? "date" : undefined}
      aria-pressed={isSelected}
      onClick={() => onSelect(dateKey)}
      className={cn(
        "flex min-h-11 flex-col items-center gap-1 rounded-xl p-1 text-sm transition-colors",
        isSelected ? "bg-primary-soft" : "hover:bg-canvas",
        isToday && "ring-1 ring-inset ring-primary",
      )}
    >
      <span>{dayNumber}</span>
      <DayDots entries={entries} titleById={titleById} />
    </button>
  );
}

function DayPanelEntry({ entry, onOpenCourse }: { entry: CalendarEntry; onOpenCourse: (documentId: string) => void }) {
  return (
    <li className="flex items-center gap-2" data-testid="calendar-entry-row">
      <span
        aria-hidden="true"
        className={cn("h-2 w-2 shrink-0 rounded-full", !entry.colour && "bg-text-muted")}
        style={entry.colour ? { backgroundColor: entry.colour } : undefined}
      />
      <span className={entry.done ? "flex-1 line-through text-text-muted" : "flex-1 text-text"}>{entry.title}</span>
      {entry.kind === "deadline" && entry.documentId && (
        <Button variant="secondary" className="rounded-2xl" onClick={() => onOpenCourse(entry.documentId!)}>
          Voir le cours
        </Button>
      )}
    </li>
  );
}

function UpcomingDeadlines({ items, todayKey }: { items: ProgressListItem[]; todayKey: string }) {
  const upcoming = items
    .filter((item) => item.deadlineDate !== null && item.deadlineDate >= todayKey)
    .sort((a, b) => a.deadlineDate!.localeCompare(b.deadlineDate!))
    .slice(0, UPCOMING_DEADLINES_LIMIT);

  return (
    <Card className="flex flex-col gap-[var(--space-block)] rounded-2xl" data-testid="upcoming-deadlines">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-text-muted">
        <CalendarClock aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
        Prochaines échéances
      </h2>
      {upcoming.length === 0 ? (
        <p className="text-sm text-text-muted">Aucune échéance à venir.</p>
      ) : (
        <ul className="flex flex-col gap-[var(--space-block)]">
          {upcoming.map((item) => (
            <li key={item.documentId} className="flex items-center gap-3" data-testid="upcoming-deadline-row">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${item.colour}26` }}>
                <CalendarClock aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} color={item.colour} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-text">{item.title}</span>
                <span className="block text-xs text-text-muted">{UPCOMING_DEADLINE_DATE_FORMATTER.format(new Date(`${item.deadlineDate}T00:00:00`))}</span>
              </span>
              <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-[length:var(--text-label)] font-semibold whitespace-nowrap text-primary">
                {countdownLabel(daysUntil(item.deadlineDate!, todayKey))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function CalendarScreen({ onOpenCourse }: { onOpenCourse: (documentId: string) => void }) {
  const now = new Date();
  const [viewed, setViewed] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { start, end } = monthRange(viewed.year, viewed.month);
  const query = useQuery({ queryKey: ["calendar", start, end], queryFn: () => getCalendar(start, end) });
  const progressQuery = useQuery({ queryKey: ["course-progress"], queryFn: listProgress });

  function goToPreviousMonth() {
    setSelectedDate(null);
    setViewed((v) => (v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 }));
  }

  function goToNextMonth() {
    setSelectedDate(null);
    setViewed((v) => (v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 }));
  }

  function goToToday() {
    const t = new Date();
    setViewed({ year: t.getFullYear(), month: t.getMonth() });
    setSelectedDate(todayDateKey(t));
  }

  const pageHeader = (
    <header className="flex flex-col gap-1">
      <h1 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-[length:var(--text-display)] font-extrabold">
        <CalendarIcon aria-hidden="true" focusable="false" size={ICON_SIZE_NAV} strokeWidth={ICON_STROKE_WIDTH} />
        Calendrier
      </h1>
      <p className="text-sm text-text-muted">Tes échéances et ce qui est prévu, d'un coup d'œil.</p>
    </header>
  );

  const monthNav = (
    <div className="flex items-center justify-between">
      <Button variant="secondary" className="rounded-2xl" onClick={goToPreviousMonth}>
        ‹ Mois précédent
      </Button>
      <h2 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">{monthLabel(viewed.year, viewed.month)}</h2>
      <Button variant="secondary" className="rounded-2xl" onClick={goToNextMonth}>
        Mois suivant ›
      </Button>
    </div>
  );

  if (query.status === "pending") {
    return (
      <main className="flex flex-col gap-[var(--space-section)] p-8">
        {pageHeader}
        <Card className="flex flex-col gap-[var(--space-section)] rounded-2xl">
          {monthNav}
          <div className="grid grid-cols-7 gap-1" data-testid="calendar-grid-skeleton">
            {Array.from({ length: 35 }, (_, i) => (
              <div key={i} className="h-11 animate-pulse rounded-xl bg-border" />
            ))}
          </div>
        </Card>
      </main>
    );
  }

  if (query.status === "error") {
    return (
      <main className="flex flex-col items-center gap-[var(--space-section)] p-8 text-center">
        <Confused />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Calendrier</h1>
        <p>Impossible de charger le calendrier. Vérifie ta connexion et réessaie.</p>
        <Button onClick={() => void query.refetch()}>Réessayer</Button>
      </main>
    );
  }

  const view = query.data;
  const entriesByDate = new Map(view.days.map((d) => [d.date, d.entries]));
  const grid = buildMonthGrid(viewed.year, viewed.month);
  const todayKey = todayDateKey();
  const progressItems = progressQuery.data ?? [];
  const titleById = new Map(progressItems.map((item) => [item.documentId, item.title]));
  const selectedEntries = selectedDate ? (entriesByDate.get(selectedDate) ?? []) : null;

  return (
    <main className="flex flex-col gap-[var(--space-section)] p-8">
      {pageHeader}

      <div className="grid gap-[var(--space-section)] lg:grid-cols-[2fr_1fr] lg:items-start">
        <Card className="flex flex-col gap-[var(--space-section)] rounded-2xl">
          {monthNav}

          <div className="grid grid-cols-7 gap-1" data-testid="calendar-grid">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="p-1 text-center text-xs font-medium text-text-muted" aria-hidden="true">
                {label}
              </div>
            ))}
            {grid.map((day) =>
              day.inMonth ? (
                <DayCell
                  key={day.dateKey}
                  dateKey={day.dateKey}
                  entries={entriesByDate.get(day.dateKey) ?? []}
                  titleById={titleById}
                  isToday={day.dateKey === todayKey}
                  isSelected={day.dateKey === selectedDate}
                  onSelect={setSelectedDate}
                />
              ) : (
                <div key={day.dateKey} data-testid="calendar-filler-day" aria-hidden="true" className="p-1 text-center text-sm text-text-muted">
                  {Number(day.dateKey.slice(8, 10))}
                </div>
              ),
            )}
          </div>

          <Card className="flex flex-col gap-2 rounded-xl" data-testid="day-panel">
            {selectedEntries === null ? (
              <p className="text-sm text-text-muted">Sélectionne un jour pour voir son contenu.</p>
            ) : selectedEntries.length === 0 ? (
              <p className="text-sm text-text-muted">Rien ce jour-là.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {selectedEntries.map((entry) => (
                  <DayPanelEntry key={entry.id} entry={entry} onOpenCourse={onOpenCourse} />
                ))}
              </ul>
            )}
          </Card>
        </Card>

        <div className="flex flex-col gap-[var(--space-block)]">
          <Button className="w-full justify-center rounded-2xl" onClick={goToToday}>
            Aller à aujourd'hui
          </Button>
          <UpcomingDeadlines items={progressItems} todayKey={todayKey} />
        </div>
      </div>
    </main>
  );
}
