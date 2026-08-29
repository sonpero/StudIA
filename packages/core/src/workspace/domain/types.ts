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
