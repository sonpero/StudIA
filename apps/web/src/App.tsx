import { APP_NAME } from "./app-info.js";
import { LoginScreen } from "./components/LoginScreen.js";
import { AuthProvider, useAuth } from "./lib/auth-context.js";

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
    <main>
      <h1>{APP_NAME}</h1>
      <p>Bonjour, {auth.user?.username}.</p>
      <button type="button" onClick={() => void auth.logout()}>
        Se déconnecter
      </button>
    </main>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
