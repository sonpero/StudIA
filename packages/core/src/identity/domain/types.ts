export type User = { id: string; username: string; createdAt: string };

export type SessionPayload = { userId: string; sessionVersion: number };

export type LoginError =
  | { kind: "invalid-credentials" }
  | { kind: "rate-limited"; retryAfterSeconds: number };
