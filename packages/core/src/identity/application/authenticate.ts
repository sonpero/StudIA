import { err, ok, type Result } from "../../shared/index.js";
import { isRateLimited, rateLimitRetryAfterSeconds } from "../domain/rate-limit.js";
import type { LoginAttemptRepository, PasswordHasher, SessionCodec, UserRepository } from "../domain/ports.js";
import type { LoginError } from "../domain/types.js";

export interface AuthenticateDeps {
  userRepository: UserRepository;
  passwordHasher: PasswordHasher;
  sessionCodec: SessionCodec;
  attemptRepository: LoginAttemptRepository;
  // Verified when the username is unknown, so an unknown-user response takes
  // the same code path (and comparable time) as a wrong-password response.
  dummyPasswordHash: string;
}

export async function authenticate(
  deps: AuthenticateDeps,
  username: string,
  password: string,
  ip: string,
  now: Date,
): Promise<Result<{ token: string }, LoginError>> {
  const attempts = deps.attemptRepository.getAttempts(ip);
  if (isRateLimited(attempts, now)) {
    return err({ kind: "rate-limited", retryAfterSeconds: rateLimitRetryAfterSeconds(attempts, now) });
  }

  const record = await deps.userRepository.findByUsername(username);
  const hashToVerify = record?.passwordHash ?? deps.dummyPasswordHash;
  const passwordValid = await deps.passwordHasher.verify(hashToVerify, password);

  if (!record || !passwordValid) {
    deps.attemptRepository.recordFailure(ip, now);
    return err({ kind: "invalid-credentials" });
  }

  deps.attemptRepository.clear(ip);
  const token = deps.sessionCodec.sign({ userId: record.id, sessionVersion: record.sessionVersion }, now);
  return ok({ token });
}
