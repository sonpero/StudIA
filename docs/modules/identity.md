# Module `identity` — M1

## Responsibility

Who the user is. Password verification, session issuing and reading, account
creation from the CLI. Nothing else in the app knows how authentication works.

There is no signup, no self-service password reset, no roles. Every user is an
independent student with their own data.

## Domain

```ts
type User = { id: string; username: string; createdAt: string };
type SessionPayload = { userId: string; sessionVersion: number };

type LoginError =
  | { kind: 'invalid-credentials' }
  | { kind: 'rate-limited'; retryAfterSeconds: number };
```

**`sessionVersion`** is stored on the user row and embedded in the token. A
password reset increments it, which invalidates every existing session. Without
it, a stateless token cannot be revoked, and that is the one thing stateless
tokens get wrong.

**Rate limiting** is a pure domain function over an attempt log:

```ts
function isRateLimited(attempts: Date[], now: Date): boolean;   // 5 in 15 minutes
```

State lives in memory in `infra/`, keyed by IP, and resets on restart. Acceptable
for a handful of users; say so in a comment rather than reaching for Redis.

## Ports

```ts
interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
}

interface SessionCodec {
  sign(payload: SessionPayload, now: Date): string;
  read(token: string, now: Date): SessionPayload | null;   // null on bad signature or expiry
}

interface UserRepository {
  findByUsername(username: string): Promise<User & { passwordHash: string; sessionVersion: number } | null>;
  findById(id: string): Promise<User & { sessionVersion: number } | null>;
  upsertPassword(username: string, hash: string, now: Date): Promise<void>;   // increments sessionVersion
}
```

argon2id in the adapter. Session TTL 30 days.

## Use cases

- `authenticate(username, password, ip, now)` → `Result<{ token }, LoginError>`
- `resolveSession(token, now)` → `Result<User, 'unauthenticated'>`. Rejects if
  `sessionVersion` in the token differs from the stored one.
- `createOrResetAccount(username, password, now)` — CLI only, never reachable
  over HTTP.

**Verification must be constant-time in the unknown-user case.** If the username
does not exist, still run a hash comparison against a dummy hash. Otherwise
response timing reveals which usernames are valid.

## Persistence

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  session_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
```

## API

| Route | Body | Success | Failure |
|---|---|---|---|
| `POST /api/auth/login` | `{ username, password }` | `204` + `Set-Cookie` | `401`, `429` |
| `POST /api/auth/logout` | — | `204` + cleared cookie | — |
| `GET /api/me` | — | `200 { id, username }` | `401` |

Cookie: `httpOnly`, `sameSite=lax`, `path=/`, `secure` from `COOKIE_SECURE` env
so local http development works. Startup fails loudly if `SESSION_SECRET` is
absent.

**Default deny.** The Fastify `requireAuth` decorator is applied globally, and
the three routes above opt out explicitly. A new route is protected unless
someone deliberately unprotects it, and there is a test asserting that adding an
unlisted route without auth fails.

Also add an `Origin` header check on every mutating request. `sameSite=lax`
already blocks most cross-site POSTs, but the check costs three lines.

## Out of scope

Signup. Roles and permissions. Password reset by the user. OAuth. Email. Any
notion of parent, teacher or shared content.

## Key tests

- Hash and verify round-trip; verify rejects a wrong password
- Token signing and reading; expired token returns null; tampered token returns null
- Rate limit: 5 failures block, the 15-minute window slides, success clears
- Password reset invalidates an existing token via `sessionVersion`
- Unknown username and wrong password take comparable time
- Integration: login sets the cookie, `/api/me` returns the user, logout clears it
- Playwright: full login and logout cycle, protected route redirects when logged out

## Open questions

- Tutoiement or vouvoiement in the login screen copy, given an all-ages audience.
  Currently tutoiement per `docs/UI.md`.
