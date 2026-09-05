import { err, ok, type Result } from "../../shared/index.js";
import type { CitationExtractor, ExtractError } from "../domain/ports.js";
import type { Section } from "../domain/types.js";

export type ExtractFixtureCase = "valid" | "degraded" | "empty" | "schema-violation" | "refine-violation";

// The adapter that actually runs in pnpm test (CLAUDE.md rule 3). Ignores
// its input like content's FixtureNotionSplitter does: these are canned,
// deterministic stand-ins, not a model. Any retry-then-fail behaviour lives
// in the real adapter (ClaudeCitationExtractor), tested at the transport
// level -- see docs/TESTING.md's "Two levels, both needed". The five
// required cases per docs/TESTING.md.
export class FixtureCitationExtractor implements CitationExtractor {
  constructor(private readonly fixtureCase: ExtractFixtureCase = "valid") {}

  extract(_input: { answer: string; sections: Section[] }): Promise<Result<{ sectionIndexes: number[] }, ExtractError>> {
    switch (this.fixtureCase) {
      case "valid":
        return Promise.resolve(ok({ sectionIndexes: [0, 1] }));
      case "degraded":
        // A legitimate but thin result: the answer only draws on one
        // section out of several -- a citation set of size 1 is still a
        // success, not an error.
        return Promise.resolve(ok({ sectionIndexes: [0] }));
      case "empty":
        // Nothing in the provided sections supports the answer: the
        // legitimate grounded:false outcome (docs/modules/tutor.md), not a
        // failure of this port.
        return Promise.resolve(ok({ sectionIndexes: [] }));
      case "schema-violation":
        return Promise.resolve(err({ kind: "invalid-output", message: "index out of range after 1 retry" }));
      case "refine-violation":
        return Promise.resolve(err({ kind: "invalid-output", message: "duplicate section indexes after 1 retry" }));
    }
  }
}
