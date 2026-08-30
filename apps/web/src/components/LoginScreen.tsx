import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "./ui/button.js";
import { Card } from "./ui/card.js";
import { useAuth } from "../lib/auth-context.js";

// Same field treatment as Aujourd'hui's own add-todo form (docs/UI.md's
// Connexion note): not a new pattern for this one screen.
const FIELD_CLASS =
  "w-full appearance-none rounded-[var(--radius-button)] border border-border bg-surface p-2 text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function errorMessage(error: { kind: "invalid-credentials" } | { kind: "rate-limited" }): string {
  if (error.kind === "rate-limited") return "Trop de tentatives. Réessaie dans quelques minutes.";
  return "Identifiant ou mot de passe incorrect.";
}

export function LoginScreen() {
  const auth = useAuth();
  const usernameId = useId();
  const passwordId = useId();
  const usernameRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same ref-plus-effect idiom as Aujourd'hui's disclosed add-todo form,
  // not the bare autoFocus attribute (docs/UI.md's Connexion note).
  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    auth
      .login(username, password)
      .then((result) => {
        setSubmitting(false);
        if (!result.ok) setError(errorMessage(result.error));
      })
      .catch(() => {
        setSubmitting(false);
        setError("Impossible de se connecter. Vérifie ta connexion et réessaie.");
      });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-8">
      <Card className="flex w-full max-w-md flex-col gap-4">
        <h1 className="font-[var(--font-display)] text-2xl font-extrabold">StudIA</h1>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <label htmlFor={usernameId} className="flex flex-col gap-1 text-sm text-text-muted">
            Identifiant
            <input
              ref={usernameRef}
              id={usernameId}
              name="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className={FIELD_CLASS}
            />
          </label>
          <label htmlFor={passwordId} className="flex flex-col gap-1 text-sm text-text-muted">
            Mot de passe
            <input
              id={passwordId}
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={FIELD_CLASS}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-text">
              {error}
            </p>
          )}
          <Button type="submit" variant="accent" disabled={submitting} className="self-start">
            {submitting ? "Connexion en cours…" : "Se connecter"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
