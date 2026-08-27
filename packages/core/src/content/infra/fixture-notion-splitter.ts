import { err, ok, type Result } from "../../shared/index.js";
import type { NotionSplitter, SplitError } from "../domain/ports.js";
import type { SplitNotion } from "../domain/types.js";

export type FixtureCase = "valid" | "degraded" | "empty" | "schema-violation" | "refine-violation";

function fiveValidNotions(): SplitNotion[] {
  return Array.from({ length: 5 }, (_, i) => ({
    title: `Notion ${String(i + 1)}`,
    body: `Corps auto-suffisant de la notion ${String(i + 1)}.`,
    difficulty: "medium",
  }));
}

// The adapter that actually runs in pnpm test (CLAUDE.md rule 3): a port
// gets a real adapter and a fixture adapter, and no test hits the network.
// The five required cases per docs/TESTING.md.
export class FixtureNotionSplitter implements NotionSplitter {
  constructor(private readonly fixtureCase: FixtureCase = "valid") {}

  split(_input: { markdown: string; hint?: { subject?: string; level?: string } }): Promise<Result<SplitNotion[], SplitError>> {
    switch (this.fixtureCase) {
      case "valid":
        return Promise.resolve(ok(fiveValidNotions()));
      case "degraded":
        // A legitimately short lesson: below the 5-notion floor, but that is
        // handle-split-job.ts's call to make (aggregate, document-level),
        // not this port's — the port itself returns whatever the model
        // produced.
        return Promise.resolve(ok(fiveValidNotions().slice(0, 2)));
      case "empty":
        return Promise.resolve(ok([]));
      case "schema-violation":
        return Promise.resolve(err({ kind: "model-error", message: "schema validation failed after 1 retry" }));
      case "refine-violation":
        return Promise.resolve(err({ kind: "model-error", message: "output failed a domain invariant (refine)" }));
    }
  }
}
