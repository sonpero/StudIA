import type { Result } from "../../shared/index.js";
import type { PomodoroSession, Todo, TodoProposal } from "./types.js";

export type ExtractedTodo = { label: string; dueDate: string | null; subject: string | null };
export type TodoExtractionOutput = { todos: ExtractedTodo[]; legible: boolean; reason?: string };
export type TodoExtractionError = { kind: "model-error"; message: string };

// today is passed in (not just implied by ctx.now) because dueDate is
// often relative on a school planner ("mardi"): the model must resolve it
// against a specific week, which post-processing on a bare weekday name
// cannot recover (docs/modules/workspace.md). legible: false is a success,
// never an TodoExtractionError — same rule as ingestion's VisionExtractor,
// whose identical illegible-photo problem this reuses the answer to.
export interface TodoExtractor {
  extract(input: { bytes: Buffer; today: string }): Promise<Result<TodoExtractionOutput, TodoExtractionError>>;
}

// Every method takes userId and filters on it (CLAUDE.md: "a repository
// method without userId in its signature is a bug"). updateTodo is the one
// method behind both the updateTodo and toggleTodo use cases (M6, step 1
// of docs/modules/workspace.md) — done is just one more optional field in
// the same patch, not a separate code path at the repository layer.
export interface TodoRepository {
  createTodo(todo: Todo): Promise<void>;
  listTodos(userId: string): Promise<Todo[]>;
  // Calendar (docs/modules/workspace.md's Calendar section). Both
  // bounds inclusive, ISO date keys (YYYY-MM-DD), compared against
  // dueDate. A todo with dueDate: null is excluded — SQL BETWEEN already
  // drops NULL on its own, but this is a decision, not that operator's
  // side effect (see the spec for why it stays excluded from the
  // calendar while remaining visible on Aujourd'hui via listTodos).
  // Ordered by dueDate then createdAt, both ascending: the order the
  // Calendar's entries contract (same doc) relies on to truncate a busy
  // day's todos deterministically.
  getTodosForUserInRange(userId: string, start: string, end: string): Promise<Todo[]>;
  // Returns the updated row, or null if no todo with this id belongs to
  // this user (does not distinguish "does not exist" from "belongs to
  // someone else" — same convention as every other module's ownership
  // check).
  updateTodo(userId: string, id: string, patch: Partial<Pick<Todo, "label" | "dueDate" | "documentId" | "done">>): Promise<Todo | null>;
  // Returns false for the same two cases updateTodo returns null for.
  deleteTodo(userId: string, id: string): Promise<boolean>;

  // Deletes any existing proposals for this job before inserting the new
  // batch, in one transaction — idempotence for a job retried after a
  // worker crash (docs/modules/workspace.md's handleTodoPhotoJob).
  replaceProposalsForJob(userId: string, jobId: string, proposals: TodoProposal[]): Promise<void>;
  listProposals(userId: string, jobId: string): Promise<TodoProposal[]>;
  // Inserts one Todo per accepted proposal and deletes every proposal for
  // the job (accepted or not), in one transaction — the central invariant
  // this milestone exists to protect: a proposal never reaches `todos`
  // outside this one call (docs/modules/workspace.md's central invariant).
  confirmProposals(userId: string, jobId: string, todos: Todo[]): Promise<void>;
  // Deletes every proposal for the job. Creates no todos.
  deleteProposals(userId: string, jobId: string): Promise<void>;

  // Pomodoro (M7, docs/modules/workspace.md's "Pomodoro (M7)" note).
  createPomodoroSession(session: PomodoroSession): Promise<void>;
  // Returns the updated row, or null if no session with this id belongs
  // to this user — same convention as updateTodo.
  endPomodoroSession(userId: string, id: string, endedAt: string): Promise<PomodoroSession | null>;
  // The most recently *started* session with endedAt still null,
  // regardless of whether its own window has since elapsed — deciding
  // whether that still counts as active is isPomodoroActive's job, not
  // this query's. Null if the user has never started one, or every one
  // they've started has already been explicitly ended.
  getLatestOpenPomodoroSession(userId: string): Promise<PomodoroSession | null>;
}
