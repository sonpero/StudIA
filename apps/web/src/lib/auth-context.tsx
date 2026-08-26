import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch, setUnauthorizedHandler } from "./api-client.js";

export interface AuthUser {
  id: string;
  username: string;
}

export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";

export type LoginError = { kind: "invalid-credentials" } | { kind: "rate-limited" };
export type LoginResult = { ok: true } | { ok: false; error: LoginError };

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  const checkSession = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await apiFetch("/api/me", { suppressUnauthorizedHandler: true });
      if (!res.ok) {
        setUser(null);
        setStatus("unauthenticated");
        return;
      }
      const body = (await res.json()) as AuthUser;
      setUser(body);
      setStatus("authenticated");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  // The 401 interceptor: any other apiFetch call in the app that comes back
  // unauthenticated (session expired, revoked, etc.) bounces the user back
  // to the login screen via this same status flip.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setStatus("unauthenticated");
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(
    async (username: string, password: string): Promise<LoginResult> => {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        suppressUnauthorizedHandler: true,
      });

      if (res.status === 204) {
        await checkSession();
        return { ok: true };
      }
      if (res.status === 429) return { ok: false, error: { kind: "rate-limited" } };
      return { ok: false, error: { kind: "invalid-credentials" } };
    },
    [checkSession],
  );

  const logout = useCallback(async () => {
    await apiFetch("/api/auth/logout", { method: "POST", suppressUnauthorizedHandler: true });
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const value = useMemo(() => ({ status, user, login, logout }), [status, user, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
