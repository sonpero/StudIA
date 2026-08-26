import {
  Argon2PasswordHasher,
  HmacSessionCodec,
  InMemoryLoginAttemptRepository,
  SqliteUserRepository,
  uuidV7Generator,
  type AuthenticateDeps,
  type CreateOrResetAccountDeps,
} from "@studia/core";
import type { Db } from "./db/connection.js";

// A fixed, valid argon2id hash verified on every login for an unknown
// username, so an unknown-user response takes the same code path (and
// comparable time) as a wrong-password response (docs/modules/identity.md:
// "verification must be constant-time in the unknown-user case"). Not tied
// to any real account; the plaintext behind it is never used to log in.
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$QLXQS4gSUj9JgJOHh2YNvA$EtxxKIkTTnKBzsZSo7AvR7lnx3Mj2v0iCvW5kURQHjI";

export interface IdentityDeps {
  authenticateDeps: AuthenticateDeps;
  createOrResetAccountDeps: CreateOrResetAccountDeps;
  sessionCodec: HmacSessionCodec;
  userRepository: SqliteUserRepository;
}

export function buildIdentityDeps(db: Db, sessionSecret: string): IdentityDeps {
  const userRepository = new SqliteUserRepository(db);
  const passwordHasher = new Argon2PasswordHasher();
  const sessionCodec = new HmacSessionCodec(sessionSecret);
  const attemptRepository = new InMemoryLoginAttemptRepository();

  return {
    authenticateDeps: {
      userRepository,
      passwordHasher,
      sessionCodec,
      attemptRepository,
      dummyPasswordHash: DUMMY_PASSWORD_HASH,
    },
    createOrResetAccountDeps: { userRepository, passwordHasher, idGenerator: uuidV7Generator },
    sessionCodec,
    userRepository,
  };
}
