import { ok, type Result } from "../../shared/index.js";
import type { IdGenerator } from "../../shared/index.js";
import type { PasswordHasher, UserRepository } from "../domain/ports.js";

export interface CreateOrResetAccountDeps {
  userRepository: UserRepository;
  passwordHasher: PasswordHasher;
  idGenerator: IdGenerator;
}

// CLI only, never reachable over HTTP (docs/modules/identity.md).
export async function createOrResetAccount(
  deps: CreateOrResetAccountDeps,
  username: string,
  password: string,
  now: Date,
): Promise<Result<{ id: string }, never>> {
  const hash = await deps.passwordHasher.hash(password);
  const newId = deps.idGenerator.next();
  await deps.userRepository.upsertPassword(username, hash, now, newId);

  // upsertPassword guarantees a row now exists for `username`.
  const row = await deps.userRepository.findByUsername(username);
  return ok({ id: row!.id });
}
