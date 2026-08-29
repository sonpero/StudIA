import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { APP_NAME } from "./app-info.js";
import { LoginScreen } from "./components/LoginScreen.js";
import { AuthProvider, useAuth } from "./lib/auth-context.js";
import { DocumentsScreen } from "./screens/DocumentsScreen.js";
import { NotionsScreen } from "./screens/NotionsScreen.js";
import { ProgressScreen } from "./screens/ProgressScreen.js";
import { ReviewScreen } from "./screens/ReviewScreen.js";
import { TodayScreen } from "./screens/TodayScreen.js";

// No router dependency for M3's small navigation surface (a handful of
// screens, linear flow): a state machine is enough, and adding a router
// would need its own one-line justification (CLAUDE.md) for a need this
// small. "progress" shows every course (docs/modules/progress.md), reached
// from whichever course's NotionsScreen the student was on; fromDocumentId
// is only so "back" returns to that same course, not a scoping parameter
// for the progress screen itself. "today" (M6, docs/modules/workspace.md)
// is reachable from anywhere via the header, not scoped to a document —
// "back" always returns to the documents list, the app's other home.
type View =
  | { name: "documents" }
  | { name: "notions"; documentId: string }
  | { name: "review"; documentId: string; notionId?: string }
  | { name: "progress"; fromDocumentId: string }
  | { name: "today" };

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

  return (
    <div>
      <header className="flex items-center justify-between border-b border-border bg-surface px-8 py-4">
        <span className="font-[var(--font-display)] text-lg font-extrabold">{APP_NAME}</span>
        <div className="flex items-center gap-3 text-sm">
          <button type="button" className="underline" onClick={() => setView({ name: "today" })}>
            Aujourd'hui
          </button>
          <p>Bonjour, {auth.user?.username}.</p>
          <button type="button" onClick={() => void auth.logout()}>
            Se déconnecter
          </button>
        </div>
      </header>
      {view.name === "documents" && (
        <DocumentsScreen onOpenNotions={(documentId) => setView({ name: "notions", documentId })} />
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
      {view.name === "progress" && <ProgressScreen onBack={() => setView({ name: "notions", documentId: view.fromDocumentId })} />}
      {view.name === "today" && <TodayScreen onBack={() => setView({ name: "documents" })} />}
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
