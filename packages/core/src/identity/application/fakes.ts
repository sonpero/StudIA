// In-memory test doubles for identity's ports. Per CLAUDE.md rule 3, every
// port gets a real adapter (infra/) and a fixture/fake used in tests; no test
// hits the network, the filesystem or a native module (argon2) through these.
import type { IdGenerator } from "../../shared/index.js";
import type { LoginAttemptRepository, PasswordHasher, SessionCodec, UserRepository } from "../domain/ports.js";
import type { SessionPayload, User } from "../domain/types.js";

export type FakeUserRow = User & { passwordHash: string; sessionVersion: number };

export function fakePasswordHasher(): PasswordHasher {
  return {
    hash: (plain) => Promise.resolve(`hashed:${plain}`),
    verify: (hash, plain) => Promise.resolve(hash === `hashed:${plain}`),
  };
}

export function fakeUserRepository(seed: FakeUserRow[] = []): UserRepository & { rows: FakeUserRow[] } {
  const rows = [...seed];
  return {
    rows,
    findByUsername: (username) => Promise.resolve(rows.find((row) => row.username === username) ?? null),
    findById: (id) => {
      const row = rows.find((r) => r.id === id);
      return Promise.resolve(
        row ? { id: row.id, username: row.username, createdAt: row.createdAt, sessionVersion: row.sessionVersion } : null,
      );
    },
    upsertPassword: (username, hash, now, newId) => {
      const existing = rows.find((row) => row.username === username);
      if (existing) {
        existing.passwordHash = hash;
        existing.sessionVersion += 1;
      } else {
        rows.push({ id: newId, username, passwordHash: hash, sessionVersion: 1, createdAt: now.toISOString() });
      }
      return Promise.resolve();
    },
  };
}

export function fakeSessionCodec(): SessionCodec {
  const store = new Map<string, { payload: SessionPayload; expiresAt: number }>();
  let counter = 0;
  return {
    sign: (payload, now) => {
      const token = `token-${String(counter++)}`;
      store.set(token, { payload, expiresAt: now.getTime() + 30 * 24 * 60 * 60 * 1000 });
      return token;
    },
    read: (token, now) => {
      const entry = store.get(token);
      if (!entry || entry.expiresAt <= now.getTime()) return null;
      return entry.payload;
    },
  };
}

export function fakeLoginAttemptRepository(): LoginAttemptRepository {
  const attempts = new Map<string, Date[]>();
  return {
    getAttempts: (ip) => attempts.get(ip) ?? [],
    recordFailure: (ip, now) => {
      const list = attempts.get(ip) ?? [];
      list.push(now);
      attempts.set(ip, list);
    },
    clear: (ip) => {
      attempts.delete(ip);
    },
  };
}

export function fakeIdGenerator(ids: string[]): IdGenerator {
  let i = 0;
  return { next: () => ids[i++] ?? `fake-id-${String(i)}` };
}
