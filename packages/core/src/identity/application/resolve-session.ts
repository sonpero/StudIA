import { err, ok, type Result } from "../../shared/index.js";
import type { SessionCodec, UserRepository } from "../domain/ports.js";
import type { User } from "../domain/types.js";

export interface ResolveSessionDeps {
  sessionCodec: SessionCodec;
  userRepository: UserRepository;
}

export async function resolveSession(
  deps: ResolveSessionDeps,
  token: string,
  now: Date,
): Promise<Result<User, "unauthenticated">> {
  const payload = deps.sessionCodec.read(token, now);
  if (!payload) return err("unauthenticated");

  const user = await deps.userRepository.findById(payload.userId);
  if (!user) return err("unauthenticated");
  if (user.sessionVersion !== payload.sessionVersion) return err("unauthenticated");

  return ok({ id: user.id, username: user.username, createdAt: user.createdAt });
}
