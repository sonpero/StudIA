import { err, ok, type Result } from "../../shared/index.js";
import type { DocumentExtractor, ExtractionError, ExtractionOutput } from "../domain/ports.js";

export type FixtureCase = "valid" | "degraded" | "empty" | "schema-violation" | "refine-violation";

// The adapter that actually runs in pnpm test (CLAUDE.md rule 3): a port
// gets a real adapter and a fixture adapter, and no test hits the network.
// The five required cases per docs/TESTING.md.
export class FixtureDocumentExtractor implements DocumentExtractor {
  constructor(private readonly fixtureCase: FixtureCase = "valid") {}

  supports(_sourceType: string): boolean {
    return true;
  }

  extract(_input: { bytes: Buffer; sourceType: string }): Promise<Result<ExtractionOutput, ExtractionError>> {
    switch (this.fixtureCase) {
      case "valid":
        return Promise.resolve(ok({ markdown: "# Titre\n\nContenu extrait.", legible: true }));
      case "degraded":
        return Promise.resolve(ok({ markdown: "", legible: false, reason: "La photo est trop floue pour être lue." }));
      case "empty":
        return Promise.resolve(ok({ markdown: "", legible: true }));
      case "schema-violation":
        return Promise.resolve(err({ kind: "model-error", message: "schema validation failed after 1 retry" }));
      case "refine-violation":
        return Promise.resolve(err({ kind: "model-error", message: "output failed a domain invariant (refine)" }));
    }
  }
}
