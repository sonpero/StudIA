import type { ProgressRepository } from "../domain/ports.js";
import type { Availability } from "../domain/types.js";

export interface SetAvailabilityDeps {
  repo: ProgressRepository;
}

export function setAvailability(deps: SetAvailabilityDeps, userId: string, availability: Availability): Promise<void> {
  return deps.repo.setAvailability(userId, availability);
}
