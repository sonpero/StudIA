import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AppNav, type AppNavItem } from "./components/AppNav.js";
import { LoginScreen } from "./components/LoginScreen.js";
import { AuthProvider, useAuth } from "./lib/auth-context.js";
import { CalendarScreen } from "./screens/CalendarScreen.js";
import { DocumentsScreen } from "./screens/DocumentsScreen.js";
import { NotionsScreen } from "./screens/NotionsScreen.js";
import { ProgressScreen } from "./screens/ProgressScreen.js";
import { ProposalsScreen } from "./screens/ProposalsScreen.js";
import { ReaderScreen } from "./screens/ReaderScreen.js";
import { ReviewScreen } from "./screens/ReviewScreen.js";
import { TodayScreen } from "./screens/TodayScreen.js";

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
  | { name: "notions"; documentId: string }
  | { name: "review"; documentId: string; notionId?: string }
  | { name: "progress"; fromDocumentId?: string }
  | { name: "today" }
  | { name: "calendar" }
  | { name: "reader"; documentId: string }
  | { name: "proposals"; jobId: string };

function AppShell() {
  const auth = useAuth();
  const [view, setView] = useState<View>({ name: "documents" });

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

  const navItems: AppNavItem[] = [
    { key: "today", label: "Aujourd'hui", active: view.name === "today", onClick: () => setView({ name: "today" }) },
    {
      key: "documents",
      label: "Mes cours",
      active: view.name === "documents" || view.name === "notions" || view.name === "reader",
      onClick: () => setView({ name: "documents" }),
    },
    { key: "progress", label: "Progression", active: view.name === "progress", onClick: () => setView({ name: "progress" }) },
    { key: "calendar", label: "Calendrier", active: view.name === "calendar", onClick: () => setView({ name: "calendar" }) },
  ];

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppNav items={navItems} dimmed={view.name === "review"} />
      <div className="flex-1 pb-16 md:pb-0">
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
              onBack={() => setView({ name: "documents" })}
              onReview={(notionId) => setView({ name: "review", documentId: view.documentId, notionId })}
              onOpenProgress={() => setView({ name: "progress", fromDocumentId: view.documentId })}
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
          {view.name === "reader" && <ReaderScreen documentId={view.documentId} onBack={() => setView({ name: "documents" })} />}
          {view.name === "proposals" && <ProposalsScreen jobId={view.jobId} onBack={() => setView({ name: "today" })} />}
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
