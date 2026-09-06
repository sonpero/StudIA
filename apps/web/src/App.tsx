import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { BookOpen, BookOpenText, Calendar, FlaskConical, Home, Layers, MessageCircle, TrendingUp } from "lucide-react";
import { useState } from "react";
import { AppNav, type AppNavItem } from "./components/AppNav.js";
import { LoginScreen } from "./components/LoginScreen.js";
import { AuthProvider, useAuth } from "./lib/auth-context.js";
import { getToday } from "./lib/today-api.js";
import { CalendarScreen } from "./screens/CalendarScreen.js";
import { DocumentsScreen } from "./screens/DocumentsScreen.js";
import { NotionsScreen } from "./screens/NotionsScreen.js";
import { ProgressScreen } from "./screens/ProgressScreen.js";
import { ProposalsScreen } from "./screens/ProposalsScreen.js";
import { ReaderScreen } from "./screens/ReaderScreen.js";
import { ReviewScreen } from "./screens/ReviewScreen.js";
import { Today } from "./screens/Today.js";
import { TodayScreen } from "./screens/TodayScreen.js";
import { TutorScreen } from "./screens/TutorScreen.js";

// No router dependency for M3's small navigation surface (a handful of
// screens, linear flow): a state machine is enough, and adding a router
// would need its own one-line justification (CLAUDE.md) for a need this
// small. "progress" shows every course (docs/modules/progress.md);
// fromDocumentId is optional (docs/UI.md's persistent nav reprise) because
// the screen is now reachable two ways — from a course's NotionsScreen,
// where "back" returns to that same course, and from the nav directly,
// where there is no originating course and "back" returns to "documents"
// instead. Neither is a scoping parameter for the progress screen itself,
// which always shows every course regardless of how it was entered. "today"
// (M6, docs/modules/workspace.md) is reachable from anywhere via the nav,
// not scoped to a document, and has no "back" of its own (docs/UI.md): it
// is one of the app's two homes, "documents" the other, both reachable from
// the same persistent nav at all times.
type View =
  | { name: "documents" }
  // documentId absent: the picker (docs/UI.md's Navigation note, M9 —
  // the same shape Tuteur already had). fromPicker mirrors tutor's own
  // fromNotions in spirit: only meaningful once documentId is set, and
  // decides whether "Retour"/"Retour à mes cours" leaves for Mes cours or
  // for the picker (the same view with documentId cleared) — a third
  // source needing its own flag, alongside "opened from a course's own
  // card on Mes cours" (neither flag set, unchanged since before M9).
  | { name: "notions"; documentId?: string; fromPicker?: boolean }
  | { name: "review"; documentId: string; notionId?: string }
  | { name: "progress"; fromDocumentId?: string }
  | { name: "today" }
  | { name: "calendar" }
  // documentId absent: the picker (M9, same shape as notions above).
  // fromNotions and fromPicker are mutually exclusive sources, both only
  // meaningful once documentId is set: fromNotions returns to that
  // course's NotionsScreen, fromPicker returns to this picker, neither set
  // (opened from a course's own card on Mes cours, unchanged since M7)
  // returns to Mes cours.
  | { name: "reader"; documentId?: string; fromNotions?: boolean; fromPicker?: boolean }
  | { name: "proposals"; jobId: string }
  // documentId absent: the picker (docs/UI.md's Tuteur note). fromNotions
  // mirrors reader's own field: only meaningful once documentId is set, and
  // decides whether "Retour" leaves for that course's NotionsScreen or for
  // the picker (the same view with documentId cleared) — the picker itself
  // has no course to return to, the same shape DocumentsScreen has none.
  | { name: "tutor"; documentId?: string; fromNotions?: boolean }
  // Temporary: the in-progress redesign prototype (apps/web/src/screens/
  // Today.tsx), staged in the nav so it can be followed as it gets wired
  // to real data, one section at a time — not part of any milestone's own
  // scope. Rendered like any other view now (its own sidebar was promoted
  // to the app's real AppNav, below) — remove this view and its nav entry
  // once it either replaces "today" above or is dropped.
  | { name: "today-preview" };

function AppShell() {
  const auth = useAuth();
  const [view, setView] = useState<View>({ name: "documents" });

  // Feeds the sidebar's own streak card and the user chip's due count
  // (apps/web/src/components/AppNav.tsx) — the same GET /api/today every
  // screen's own due/streak data already comes from (Today.tsx,
  // TodayScreen.tsx), so this shares that one cached query rather than
  // adding a second read: whichever of the three mounts first fetches it,
  // the others reuse the cache. Called unconditionally, ahead of every
  // early return below (Rules of Hooks: a hook after a conditional return
  // that stops firing once auth resolves throws "Rendered more hooks than
  // during the previous render" on the very first loading -> authenticated
  // transition) — enabled only once authenticated, so it never fires
  // against a session that isn't there yet.
  const sidebarQuery = useQuery({ queryKey: ["today"], queryFn: getToday, enabled: auth.status === "authenticated" });

  if (auth.status === "loading") {
    return (
      <main>
        <p>Chargement…</p>
      </main>
    );
  }

  if (auth.status === "error") {
    return (
      <main>
        <p role="alert">Impossible de vérifier ta session. Vérifie ta connexion et réessaie.</p>
      </main>
    );
  }

  if (auth.status === "unauthenticated") {
    return <LoginScreen />;
  }

  // docs/UI.md's Navigation note (M9): Notions and Lecteur are now their own
  // top-level destinations, grouped beside Mes cours in that order — the
  // catalogue, then a course's own atomic units, then its full source text.
  // "Mes cours" no longer stays active for those two views: each has its
  // own nav item now, so the old fallback (active for notions/reader too)
  // would light up two items at once.
  const navItems: AppNavItem[] = [
    { key: "today", label: "Aujourd'hui", icon: Home, active: view.name === "today", onClick: () => setView({ name: "today" }) },
    { key: "documents", label: "Mes cours", icon: BookOpen, active: view.name === "documents", onClick: () => setView({ name: "documents" }) },
    { key: "notions", label: "Notions", icon: Layers, active: view.name === "notions", onClick: () => setView({ name: "notions" }) },
    { key: "reader", label: "Lecteur", icon: BookOpenText, active: view.name === "reader", onClick: () => setView({ name: "reader" }) },
    { key: "progress", label: "Progression", icon: TrendingUp, active: view.name === "progress", onClick: () => setView({ name: "progress" }) },
    { key: "calendar", label: "Calendrier", icon: Calendar, active: view.name === "calendar", onClick: () => setView({ name: "calendar" }) },
    { key: "tutor", label: "Tuteur", icon: MessageCircle, active: view.name === "tutor", onClick: () => setView({ name: "tutor" }) },
    // Temporary staging entry, kept last and visually distinct (FlaskConical,
    // not part of the M9 icon set) so it never reads as a real destination —
    // see the "today-preview" View variant above.
    { key: "today-preview", label: "Today", icon: FlaskConical, active: view.name === "today-preview", onClick: () => setView({ name: "today-preview" }) },
  ];

  const sidebarStreak = sidebarQuery.data?.streak ?? 0;
  const sidebarDueCount = sidebarQuery.data?.dueCards.reduce((sum, c) => sum + c.count, 0) ?? 0;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppNav items={navItems} dimmed={view.name === "review"} streak={sidebarStreak} dueCount={sidebarDueCount} username={auth.user?.username ?? ""} />
      {/* md:ml-60 reserves the space the now-fixed sidebar (AppNav) takes
          out of normal flow on desktop — without it, content would render
          underneath it instead of beside it. */}
      <div data-testid="app-content" className="flex-1 pb-16 md:ml-60 md:pb-0">
        <div className="flex items-center justify-end gap-3 border-b border-border bg-surface px-8 py-3 text-sm">
          <p>Bonjour, {auth.user?.username}.</p>
          <button type="button" onClick={() => void auth.logout()}>
            Se déconnecter
          </button>
        </div>
        <div className="mx-auto max-w-6xl">
          {view.name === "documents" && (
            <DocumentsScreen
              onOpenNotions={(documentId) => setView({ name: "notions", documentId })}
              onOpenReader={(documentId) => setView({ name: "reader", documentId })}
            />
          )}
          {view.name === "notions" && (
            <NotionsScreen
              documentId={view.documentId}
              fromPicker={view.fromPicker}
              onBack={() => (view.fromPicker ? setView({ name: "notions" }) : setView({ name: "documents" }))}
              onReview={(notionId) => view.documentId && setView({ name: "review", documentId: view.documentId, notionId })}
              onOpenProgress={() => setView({ name: "progress", fromDocumentId: view.documentId })}
              onOpenReader={() => setView({ name: "reader", documentId: view.documentId, fromNotions: true })}
              onOpenTutor={() => setView({ name: "tutor", documentId: view.documentId, fromNotions: true })}
              onSelectDocument={(documentId) => setView({ name: "notions", documentId, fromPicker: true })}
            />
          )}
          {view.name === "review" && (
            <ReviewScreen
              documentId={view.documentId}
              notionId={view.notionId}
              onLeave={() => setView({ name: "notions", documentId: view.documentId })}
            />
          )}
          {view.name === "progress" && (
            <ProgressScreen
              onBack={() => (view.fromDocumentId ? setView({ name: "notions", documentId: view.fromDocumentId }) : setView({ name: "documents" }))}
              onOpenCourse={(documentId) => setView({ name: "notions", documentId })}
            />
          )}
          {view.name === "today" && (
            <TodayScreen
              onOpenProposals={(jobId) => setView({ name: "proposals", jobId })}
              onOpenCourse={(documentId) => setView({ name: "notions", documentId })}
              onReviewCourse={(documentId) => setView({ name: "review", documentId })}
            />
          )}
          {view.name === "calendar" && <CalendarScreen onOpenCourse={(documentId) => setView({ name: "notions", documentId })} />}
          {view.name === "reader" && (
            <ReaderScreen
              documentId={view.documentId}
              onBack={() =>
                view.fromNotions
                  ? setView({ name: "notions", documentId: view.documentId })
                  : view.fromPicker
                    ? setView({ name: "reader" })
                    : setView({ name: "documents" })
              }
              onSelectDocument={(documentId) => setView({ name: "reader", documentId, fromPicker: true })}
            />
          )}
          {view.name === "proposals" && <ProposalsScreen jobId={view.jobId} onBack={() => setView({ name: "today" })} />}
          {view.name === "tutor" && (
            <TutorScreen
              documentId={view.documentId}
              onSelectDocument={(documentId) => setView({ name: "tutor", documentId })}
              onBack={() => (view.fromNotions && view.documentId ? setView({ name: "notions", documentId: view.documentId }) : setView({ name: "tutor" }))}
            />
          )}
          {view.name === "today-preview" && (
            <Today
              username={auth.user?.username ?? ""}
              onReviewCourse={(documentId) => setView({ name: "review", documentId })}
              onOpenProposals={(jobId) => setView({ name: "proposals", jobId })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function App() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </QueryClientProvider>
  );
}
