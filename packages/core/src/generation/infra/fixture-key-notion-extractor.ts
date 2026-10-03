import { err, ok, type Result } from "../../shared/index.js";
import type { KeyNotionExtraction, KeyNotionExtractionError, KeyNotionExtractionInput, KeyNotionExtractor } from "../domain/ports.js";

export type FixtureCase = "valid" | "degraded" | "empty" | "schema-violation" | "refine-violation";

// The fixture adapter used by pnpm test and by e2e (LLM_ADAPTER=fixture):
// one key notion per reading notion, deterministic. The first half (rounded
// up) are essential, the first and the last are synthesis notions, all in
// one section.
export class FixtureKeyNotionExtractor implements KeyNotionExtractor {
  constructor(private readonly fixtureCase: FixtureCase = "valid") {}

  extract(input: KeyNotionExtractionInput): Promise<Result<KeyNotionExtraction, KeyNotionExtractionError>> {
    const count = input.readingNotions.length;
    const keyNotions = input.readingNotions.map((notion, index) => ({
      title: notion.title,
      summary: `L'essentiel de « ${notion.title} ».`,
      importance: index < Math.ceil(count / 2) ? ("essential" as const) : ("important" as const),
      isSynthesis: index === 0 || index === count - 1,
      sectionIndex: 0,
      readingNotionIds: [notion.id],
    }));
    switch (this.fixtureCase) {
      case "valid":
        return Promise.resolve(ok({ sections: ["Cours"], keyNotions }));
      case "degraded":
        return Promise.resolve(ok({ sections: ["Cours"], keyNotions: keyNotions.slice(0, 1) }));
      case "empty":
        return Promise.resolve(ok({ sections: [], keyNotions: [] }));
      case "schema-violation":
        return Promise.resolve(err({ kind: "model-error", message: "schema validation failed after 1 retry" }));
      case "refine-violation":
        return Promise.resolve(err({ kind: "model-error", message: "a section has no key notion, after 1 retry" }));
    }
  }
}
