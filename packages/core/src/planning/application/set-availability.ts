import type { PlanningRepository } from "../domain/ports.js";
import type { Availability } from "../domain/types.js";

export interface SetAvailabilityDeps {
  repo: PlanningRepository;
}

export function setAvailability(deps: SetAvailabilityDeps, userId: string, availability: Availability): Promise<void> {
  return deps.repo.setAvailability(userId, availability);
}
