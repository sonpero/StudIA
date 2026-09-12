import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { BookOpen, BookOpenText, Calendar, GraduationCap, Home, Layers, MessageCircle, TrendingUp } from "lucide-react";
import { useState } from "react";
import { APP_NAME } from "./app-info.js";
import { AppNav, type AppNavItem } from "./components/AppNav.js";
import { Button } from "./components/ui/button.js";
import { LoginScreen } from "./components/LoginScreen.js";
import { PomodoroHeaderWidget } from "./components/PomodoroHeaderWidget.js";
import { AuthProvider, useAuth } from "./lib/auth-context.js";
import { ICON_SIZE_NAV, ICON_STROKE_WIDTH } from "./lib/icons.js";
import { getToday } from "./lib/today-api.js";
import { CalendarScreen } from "./screens/CalendarScreen.js";
import { DocumentsScreen } from "./screens/DocumentsScreen.js";
import { NotionsScreen } from "./screens/NotionsScreen.js";
import { ProgressScreen } from "./screens/ProgressScreen.js";
import { ProposalsScreen } from "./screens/ProposalsScreen.js";
import { ReaderScreen } from "./screens/ReaderScreen.js";
import { ReviewScreen } from "./screens/ReviewScreen.js";
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
// instead. It is not a scoping parameter (the screen still lists every
// course regardless of how it was entered), but its own later pill-selector
// redesign (docs/UI.md's Progression note) does reuse it to pre-select that
// course's own pill, the same idiom Notions/Lecteur already established for
// their own documentId props. "today"
// (M6, docs/modules/workspace.md; redesigned under M9) is reachable from
// anywhere via the nav, not scoped to a document, has no "back" of its own
// (docs/UI.md), and is now the app's own landing view — AppShell's initial
// state — with "documents" the other home, both reachable from the same
// persistent nav at all times.
type View =
  | { name: "documents" }
  // documentId absent: the nav's own direct entry (M9's Navigation note) —
  // NotionsScreen picks its own first course and shows a pill selector,
  // no separate picker page to have come from any more (its own redesign,
  // later). documentId set: a deep link from elsewhere (Progression's
  // "Voir le cours", Calendrier's day panel, Lecteur/Tuteur's own "Retour"
  // targets) — that course is pre-selected and "Retour à mes cours"
  // reappears.
  | { name: "notions"; documentId?: string }
  | { name: "review"; documentId: string; notionId?: string }
  | { name: "progress"; fromDocumentId?: string }
  | { name: "today" }
  | { name: "calendar" }
  // documentId absent: the nav's own direct entry — Lecteur's own later
  // redesign unified it with the same pill selector Notions already uses,
  // no separate picker view left to transition into (fromPicker is gone:
  // switching a course is now a local selection inside ReaderScreen, not a
  // view transition). fromNotions, only meaningful once documentId is set,
  // returns to that course's NotionsScreen; unset (opened from a course's
  // own card on Mes cours, unchanged since M7) returns to Mes cours.
  | { name: "reader"; documentId?: string; fromNotions?: boolean }
  | { name: "proposals"; jobId: string }
  // documentId absent: the picker (docs/UI.md's Tuteur note). fromNotions
  // mirrors reader's own field: only meaningful once documentId is set, and
  // decides whether "Retour" leaves for that course's NotionsScreen or for
  // the picker (the same view with documentId cleared) — the picker itself
  // has no course to return to, the same shape DocumentsScreen has none.
  | { name: "tutor"; documentId?: string; fromNotions?: boolean };

function AppShell() {
  const auth = useAuth();
  const [view, setView] = useState<View>({ name: "today" });

  // Feeds the sidebar's own streak card and the user chip's due count
  // (apps/web/src/components/AppNav.tsx) — the same GET /api/today
  // TodayScreen.tsx's own due/streak data already comes from, so this
  // shares that one cached query rather than adding a second read:
  // whichever of the two mounts first fetches it, the other reuses the
  // cache. Called unconditionally, ahead of every
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
  // shortLabel: mobile-only visible text, ≤7 characters, hidden from
  // assistive tech (AppNav.tsx's own comment on the field has the full
  // reasoning) — a presentation choice for the stacked mobile bar alone,
  // never a rename: label stays "Aujourd'hui"/"Mes cours"/etc. everywhere
  // else (screen titles, desktop nav, the accessible name). Optional now
  // (AppNavItem's own comment): a later copy rename made "Progression" and
  // "Calendrier" into "Progrès" and "Agenda", both already 7 characters or
  // fewer, so only Aujourd'hui and Mes cours still need a distinct short
  // form — the other five's own shortLabel would just repeat their label.
  const navItems: AppNavItem[] = [
    { key: "today", label: "Aujourd'hui", shortLabel: "Accueil", icon: Home, active: view.name === "today", onClick: () => setView({ name: "today" }) },
    { key: "documents", label: "Mes cours", shortLabel: "Cours", icon: BookOpen, active: view.name === "documents", onClick: () => setView({ name: "documents" }) },
    { key: "notions", label: "Notions", icon: Layers, active: view.name === "notions", onClick: () => setView({ name: "notions" }) },
    { key: "reader", label: "Lecteur", icon: BookOpenText, active: view.name === "reader", onClick: () => setView({ name: "reader" }) },
    { key: "progress", label: "Progrès", icon: TrendingUp, active: view.name === "progress", onClick: () => setView({ name: "progress" }) },
    { key: "calendar", label: "Agenda", icon: Calendar, active: view.name === "calendar", onClick: () => setView({ name: "calendar" }) },
    { key: "tutor", label: "Tuteur", icon: MessageCircle, active: view.name === "tutor", onClick: () => setView({ name: "tutor" }) },
  ];

  const sidebarStreak = sidebarQuery.data?.streak ?? 0;
  const sidebarDueCount = sidebarQuery.data?.dueCards.reduce((sum, c) => sum + c.count, 0) ?? 0;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppNav items={navItems} dimmed={view.name === "review"} streak={sidebarStreak} dueCount={sidebarDueCount} username={auth.user?.username ?? ""} />
      {/* md:ml-60 reserves the space the now-fixed sidebar (AppNav) takes
          out of normal flow on desktop — without it, content would render
          underneath it instead of beside it. pb-[var(--nav-bar-height-
          mobile)] does the same for the fixed mobile bottom bar (tokens.css)
          — the same token AppNav.tsx's own h-* reads, not a second,
          independently guessed number. */}
      <div data-testid="app-content" className="flex-1 pb-[var(--nav-bar-height-mobile)] md:ml-60 md:pb-0">
        <div data-testid="app-header" className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 text-sm md:justify-end md:px-8">
          {/* Mobile only: AppNav.tsx's own sidebar already carries the app's
              identity (logo + name) on desktop, but that block is itself
              hidden below 768px (docs/UI.md's Navigation note) — without
              this, no screen would name the app at all on a phone. Same
              visual treatment as the sidebar's own mark, not a redrawn
              variant: same icon, same circle, same display font, just
              without the tagline this compact bar has no room for. */}
          <div className="flex items-center gap-2 md:hidden" data-testid="mobile-app-identity">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-button)] bg-primary">
              <GraduationCap aria-hidden="true" focusable="false" size={ICON_SIZE_NAV} strokeWidth={ICON_STROKE_WIDTH} color="#fff" />
            </span>
            <span className="font-[family-name:var(--font-display)] text-base font-extrabold leading-tight">{APP_NAME}</span>
          </div>
          <div className="flex items-center gap-3">
            <PomodoroHeaderWidget hideOnCurrentView={view.name === "today"} />
            <p>Bonjour, {auth.user?.username}.</p>
            <Button type="button" variant="link" onClick={() => void auth.logout()}>
              Se déconnecter
            </Button>
          </div>
        </div>
        <div className="mx-auto max-w-6xl">
          {view.name === "documents" && (
            <DocumentsScreen
              onOpenReader={(documentId) => setView({ name: "reader", documentId })}
              onReviewCourse={(documentId) => setView({ name: "review", documentId })}
            />
          )}
          {view.name === "notions" && (
            <NotionsScreen
              documentId={view.documentId}
              onBack={() => setView({ name: "documents" })}
              onReview={(documentId, notionId) => setView({ name: "review", documentId, notionId })}
              onOpenProgress={(documentId) => setView({ name: "progress", fromDocumentId: documentId })}
              onOpenReader={(documentId) => setView({ name: "reader", documentId, fromNotions: true })}
              onOpenTutor={(documentId) => setView({ name: "tutor", documentId, fromNotions: true })}
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
              documentId={view.fromDocumentId}
              onBack={() => (view.fromDocumentId ? setView({ name: "notions", documentId: view.fromDocumentId }) : setView({ name: "documents" }))}
              onOpenCourse={(documentId) => setView({ name: "notions", documentId })}
              onReview={(documentId) => setView({ name: "review", documentId })}
            />
          )}
          {view.name === "today" && (
            <TodayScreen
              username={auth.user?.username ?? ""}
              onReviewCourse={(documentId) => setView({ name: "review", documentId })}
              onOpenProposals={(jobId) => setView({ name: "proposals", jobId })}
            />
          )}
          {view.name === "calendar" && <CalendarScreen onOpenCourse={(documentId) => setView({ name: "notions", documentId })} />}
          {view.name === "reader" && (
            <ReaderScreen
              documentId={view.documentId}
              onBack={() => (view.fromNotions && view.documentId ? setView({ name: "notions", documentId: view.documentId }) : setView({ name: "documents" }))}
              onOpenNotions={(documentId) => setView({ name: "notions", documentId })}
              onOpenTutor={(documentId) => setView({ name: "tutor", documentId })}
            />
          )}
          {view.name === "proposals" && <ProposalsScreen jobId={view.jobId} onBack={() => setView({ name: "today" })} />}
          {view.name === "tutor" && (
            <TutorScreen
              documentId={view.documentId}
              onBack={() => (view.fromNotions && view.documentId ? setView({ name: "notions", documentId: view.documentId }) : setView({ name: "documents" }))}
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
