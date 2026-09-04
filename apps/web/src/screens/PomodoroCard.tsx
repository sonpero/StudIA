import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { FIELD_CLASS, SELECT_CHEVRON } from "../components/ui/field-styles.js";
import { endPomodoro, getActivePomodoro, startPomodoro, type PomodoroSession } from "../lib/pomodoro-api.js";
import type { Todo } from "../lib/today-api.js";

const POMODORO_ACTIVE_QUERY_KEY = ["pomodoro-active"];

function remainingSeconds(session: PomodoroSession): number {
  const elapsed = Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000);
  return Math.max(0, session.durationSeconds - elapsed);
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

// Deleted mid-session is indistinguishable from never selected the moment
// it happens: pomodoro_sessions.todo_id is ON DELETE SET NULL
// (docs/modules/workspace.md's Persistence section), so this screen's own
// lookup mirrors that by reading the same, currently-live todos list
// (docs/UI.md's Aujourd'hui — pomodoro note) rather than caching a label.
function resolveTodoLabel(todos: Todo[], todoId: string | null): string | null {
  if (!todoId) return null;
  return todos.find((t) => t.id === todoId)?.label ?? null;
}

export function PomodoroCard({ todos }: { todos: Todo[] }) {
  const activeQuery = useQuery({ queryKey: POMODORO_ACTIVE_QUERY_KEY, queryFn: getActivePomodoro, staleTime: Infinity, refetchOnWindowFocus: false });

  const [phase, setPhase] = useState<"idle" | "running" | "finished">("idle");
  const [session, setSession] = useState<PomodoroSession | null>(null);
  const [resyncNotice, setResyncNotice] = useState(false);
  const [selectedTodoId, setSelectedTodoId] = useState("");
  const [, forceTick] = useState(0);
  const todoSelectId = useId();

  // Runs once, off the mount fetch only (docs/UI.md's Aujourd'hui —
  // pomodoro note: "one GET /api/pomodoro/active call on mount"). A later
  // background refetch must never downgrade a running countdown back to
  // idle just because the session's own window has since elapsed — that
  // would contradict the "freezes at 00:00, no auto-transition" rule below
  // — so this effect is guarded to fire at most once.
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    if (activeQuery.status !== "success") return;
    initializedRef.current = true;
    if (activeQuery.data) {
      setSession(activeQuery.data);
      setPhase("running");
    }
  }, [activeQuery.status, activeQuery.data]);

  // Purely a re-render trigger: the countdown itself is always derived
  // fresh from session.startedAt (remainingSeconds above), never
  // accumulated client-side.
  useEffect(() => {
    if (phase !== "running") return;
    const interval = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [phase]);

  const startMutation = useMutation({
    mutationFn: () => startPomodoro(selectedTodoId || null),
    onSuccess: (result) => {
      setSession(result.session);
      setPhase("running");
      setResyncNotice(result.status === "already-active");
      setSelectedTodoId("");
    },
  });

  const endMutation = useMutation({
    mutationFn: () => endPomodoro(session!.id),
    // session is left untouched on purpose: the "juste terminée" line
    // below reads it for durationSeconds/todoId, and it is already the
    // real server object (from the start call, the mount resume, or the
    // 409 body) — nothing optimistic is introduced here, this transition
    // only happens once the 204 has actually come back.
    onSuccess: () => {
      setPhase("finished");
      setResyncNotice(false);
    },
  });

  const linkedTodoLabel = session ? resolveTodoLabel(todos, session.todoId) : null;
  const availableTodos = todos.filter((t) => !t.done);

  return (
    <Card className="flex flex-col gap-3" data-testid="pomodoro-card">
      <h2 className="text-[length:var(--text-label)] font-medium text-text-muted">Pomodoro</h2>

      {phase === "idle" && (
        <div className="flex flex-col gap-3">
          <label htmlFor={todoSelectId} className="flex flex-col gap-1 text-sm text-text-muted">
            Todo (facultatif)
            <select
              id={todoSelectId}
              value={selectedTodoId}
              onChange={(e) => setSelectedTodoId(e.target.value)}
              className={`${FIELD_CLASS} bg-no-repeat pr-8`}
              style={{ backgroundImage: SELECT_CHEVRON, backgroundPosition: "right 0.6rem center", backgroundSize: "1rem" }}
            >
              <option value="">Aucun</option>
              {availableTodos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          {/* This state's only action (docs/UI.md's Aujourd'hui — pomodoro
              note grants it the same single-action --accent exception as
              Connexion's "Se connecter"). Disabled until the mount fetch
              above settles, so a click can't race ahead of knowing whether
              a session is already running — the 409 path below still
              covers that race if it ever happens anyway. */}
          <Button type="button" variant="accent" disabled={startMutation.isPending || activeQuery.isPending} onClick={() => startMutation.mutate()} className="self-start">
            {startMutation.isPending ? "Démarrage…" : "Démarrer"}
          </Button>
        </div>
      )}

      {phase === "running" && session && (
        <div className="flex flex-col gap-2">
          {resyncNotice && <p className="text-sm text-text-muted">Une séance est déjà en cours.</p>}
          <span className="font-[family-name:var(--font-display)] text-[length:var(--text-display)] font-extrabold tabular-nums text-text" data-testid="pomodoro-countdown">
            {formatCountdown(remainingSeconds(session))}
          </span>
          {linkedTodoLabel && <p className="text-sm text-text-muted">sur « {linkedTodoLabel} »</p>}
          <Button type="button" variant="accent" disabled={endMutation.isPending} onClick={() => endMutation.mutate()} className="self-start">
            {endMutation.isPending ? "…" : "Terminer"}
          </Button>
        </div>
      )}

      {phase === "finished" && session && (
        <p data-testid="pomodoro-finished">
          Séance terminée : {Math.round(session.durationSeconds / 60)} minutes{linkedTodoLabel ? ` sur « ${linkedTodoLabel} »` : ""}.
        </p>
      )}
    </Card>
  );
}
