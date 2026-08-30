// docs/modules/workspace.md. M6 scope only — PomodoroSession is M7, not
// defined here (CLAUDE.md: no tables, no fields, for data no current
// milestone stores).
export type Todo = {
  id: string;
  userId: string;
  label: string;
  dueDate: string | null;
  documentId: string | null;
  done: boolean;
  source: "manual" | "photo";
  createdAt: string;
};

// getToday's composed view (docs/modules/workspace.md's "Why workspace
// composes, not review"). dueCards and notionsBelowTarget only carry an
// entry for a document with count > 0 — a course with nothing due and
// nothing behind target has nothing to say here. upcomingDeadlines
// excludes a lapsed deadline: progress's own screen already gives that
// its own actionable treatment, and "upcoming" stops describing a date
// that has passed.
export type TodayView = {
  date: string;
  dueCards: { documentId: string; documentTitle: string; colour: string; count: number }[];
  notionsBelowTarget: { documentId: string; documentTitle: string; colour: string; count: number }[];
  todos: Todo[];
  upcomingDeadlines: { documentId: string; title: string; deadlineDate: string; deadlineLabel: string | null; daysAway: number }[];
};

// Calendar (docs/modules/workspace.md's Calendar section). One
// entry per date that has at least one deadline or dated todo — a date
// with nothing is simply absent from `days`, not present with an empty
// array, so the screen's grid layout (which dates exist in the month) and
// this view's content (what's on a date that has something) stay two
// separate concerns. Within a day, deadlines always precede todos — a
// contract `buildCalendarView` guarantees by construction, not a sort the
// screen must redo, so the density rule that decides "N dots" vs "two
// dots plus a count" (docs/UI.md's Calendrier note) applies directly to
// `entries` with no regrouping or resorting on the screen side.
export type CalendarEntry = {
  kind: "deadline" | "todo";
  id: string; // the deadline's or todo's own id
  title: string;
  documentId: string | null; // null only for a todo with no linked course
  colour: string | null; // the course's subject colour; null for a course-less todo
  done: boolean | null; // todos only; null for a deadline — no such concept there
};

export type CalendarDay = {
  date: string; // ISO date key, YYYY-MM-DD
  entries: CalendarEntry[]; // every entry on this date, deadlines first, uncapped
};

export type CalendarView = {
  start: string;
  end: string;
  days: CalendarDay[]; // one per date with >=1 entry, in date order
};

// A photo-extraction job's output, never written directly to `todos`
// (docs/modules/workspace.md): confirming copies accepted rows into
// `todos` and deletes the whole set; rejecting just deletes it.
export type TodoProposal = {
  id: string;
  jobId: string;
  userId: string;
  label: string;
  dueDate: string | null;
  subjectHint: string | null;
  createdAt: string;
};
