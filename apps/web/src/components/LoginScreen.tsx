import { useId, useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth-context.js";

function errorMessage(error: { kind: "invalid-credentials" } | { kind: "rate-limited" }): string {
  if (error.kind === "rate-limited") return "Trop de tentatives. Réessaie dans quelques minutes.";
  return "Identifiant ou mot de passe incorrect.";
}

export function LoginScreen() {
  const auth = useAuth();
  const usernameId = useId();
  const passwordId = useId();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    void auth.login(username, password).then((result) => {
      setSubmitting(false);
      if (!result.ok) setError(errorMessage(result.error));
    });
  };

  return (
    <main>
      <h1>StudIA</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor={usernameId}>Identifiant</label>
          <input
            id={usernameId}
            name="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor={passwordId}>Mot de passe</label>
          <input
            id={passwordId}
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Connexion en cours…" : "Se connecter"}
        </button>
      </form>
    </main>
  );
}
