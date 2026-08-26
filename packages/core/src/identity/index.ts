export type { User, SessionPayload, LoginError } from "./domain/types.js";
export type { PasswordHasher, SessionCodec, UserRepository, LoginAttemptRepository } from "./domain/ports.js";

export { authenticate, type AuthenticateDeps } from "./application/authenticate.js";
export { resolveSession, type ResolveSessionDeps } from "./application/resolve-session.js";
export { createOrResetAccount, type CreateOrResetAccountDeps } from "./application/create-or-reset-account.js";

export { Argon2PasswordHasher } from "./infra/argon2-password-hasher.js";
export { HmacSessionCodec } from "./infra/hmac-session-codec.js";
export { InMemoryLoginAttemptRepository } from "./infra/in-memory-login-attempt-repository.js";
export { SqliteUserRepository, type IdentityDb } from "./infra/user-repository.js";
// Exported so apps/api/src/db/schema.ts can aggregate it for drizzle-kit
// (drizzle-kit needs a single entry file); not part of the module's use-case
// surface.
export { usersTable } from "./infra/schema.js";
