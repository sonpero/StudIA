import type { SessionPayload, User } from "./types.js";

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
}

export interface SessionCodec {
  sign(payload: SessionPayload, now: Date): string;
  read(token: string, now: Date): SessionPayload | null;
}

export interface UserRepository {
  findByUsername(
    username: string,
  ): Promise<(User & { passwordHash: string; sessionVersion: number }) | null>;
  findById(id: string): Promise<(User & { sessionVersion: number }) | null>;
  // Deviates from docs/modules/identity.md's signature by taking `newId`:
  // CLAUDE.md requires IDs to be generated in application/, never inferred by
  // an infra adapter deciding create-vs-update on its own. `newId` is used
  // only when no row exists yet for `username`.
  upsertPassword(username: string, hash: string, now: Date, newId: string): Promise<void>;
}

// Not in docs/modules/identity.md's Ports list, but required to keep the rate
// limiting described in its Domain section (a pure function over an attempt
// log) testable without reaching into infra from application/.
export interface LoginAttemptRepository {
  getAttempts(ip: string): Date[];
  recordFailure(ip: string, now: Date): void;
  clear(ip: string): void;
}
