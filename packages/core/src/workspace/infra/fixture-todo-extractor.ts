import { err, ok, type Result } from "../../shared/index.js";
import type { TodoExtractionError, TodoExtractionOutput, TodoExtractor } from "../domain/ports.js";

export type FixtureCase = "valid" | "degraded" | "empty" | "schema-violation" | "refine-violation";

// The adapter that actually runs in pnpm test (CLAUDE.md rule 3): a port
// gets a real adapter and a fixture adapter, and no test hits the network.
// The five required cases per docs/TESTING.md.
export class FixtureTodoExtractor implements TodoExtractor {
  constructor(private readonly fixtureCase: FixtureCase = "valid") {}

  extract(_input: { bytes: Buffer; today: string }): Promise<Result<TodoExtractionOutput, TodoExtractionError>> {
    switch (this.fixtureCase) {
      case "valid":
        return Promise.resolve(
          ok({
            todos: [
              { label: "Rendre le devoir de maths", dueDate: "2026-03-10", subject: "Maths" },
              { label: "Réviser le contrôle d'histoire", dueDate: "2026-03-12", subject: "Histoire" },
            ],
            legible: true,
          }),
        );
      case "degraded":
        return Promise.resolve(ok({ todos: [], legible: false, reason: "La photo est trop floue pour être lue." }));
      case "empty":
        return Promise.resolve(ok({ todos: [], legible: true }));
      case "schema-violation":
        return Promise.resolve(err({ kind: "model-error", message: "schema validation failed after 1 retry" }));
      case "refine-violation":
        return Promise.resolve(err({ kind: "model-error", message: "output failed a domain invariant (refine)" }));
    }
  }
}
