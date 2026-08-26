import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { APP_NAME } from "./app-info.js";
import { LoginScreen } from "./components/LoginScreen.js";
import { AuthProvider, useAuth } from "./lib/auth-context.js";
import { DocumentsScreen } from "./screens/DocumentsScreen.js";

function AppShell() {
  const auth = useAuth();

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
          <p>Bonjour, {auth.user?.username}.</p>
          <button type="button" onClick={() => void auth.logout()}>
            Se déconnecter
          </button>
        </div>
      </header>
      <DocumentsScreen />
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
