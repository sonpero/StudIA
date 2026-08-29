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
