// Golden-set evaluation (docs/TESTING.md): real API calls, costs money,
// never run in CI, no pass/fail gate on a pull request. Run manually with
// `pnpm eval` and ANTHROPIC_API_KEY set.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ClaudeCardGenerator, ClaudeNotionSplitter, createLanguageModel } from "@studia/core";
import { describe, expect, it } from "vitest";

const GOLDEN_DIR = path.resolve(import.meta.dirname, "golden");
const RESULTS_DIR = path.resolve(import.meta.dirname, "results");

interface ExpectedMeta {
  subject: string;
  level: string;
  description: string;
  expectedNotionRange: [number, number];
  expectedTopics: string[];
}

interface CaseResult {
  case: string;
  subject: string;
  splitSchemaValid: boolean;
  notionCount: number;
  inExpectedRange: boolean;
  cardSchemaValid: boolean | null;
  cardCount: number;
}

describe("M3 golden-set eval", () => {
  it(
    "splits and generates cards for every golden document, recording notion coverage and granularity",
    async () => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          "ANTHROPIC_API_KEY must be set to run pnpm eval (docs/TESTING.md: real API calls, costs money, manual only).",
        );
      }

      const model = createLanguageModel({ apiKey });
      const splitter = new ClaudeNotionSplitter(model);
      const generator = new ClaudeCardGenerator(model);

      const cases = readdirSync(GOLDEN_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();

      // M3's explicit acceptance criterion (docs/MILESTONES.md): a golden
      // set of at least 5 documents.
      expect(cases.length).toBeGreaterThanOrEqual(5);

      const results: CaseResult[] = [];

      for (const caseName of cases) {
        const dir = path.join(GOLDEN_DIR, caseName);
        const markdown = readFileSync(path.join(dir, "input.md"), "utf8");
        const expected = JSON.parse(readFileSync(path.join(dir, "expected.json"), "utf8")) as ExpectedMeta;

        const splitResult = await splitter.split({ markdown, hint: { subject: expected.subject, level: expected.level } });
        const notionCount = splitResult.ok ? splitResult.value.length : 0;
        const inExpectedRange = notionCount >= expected.expectedNotionRange[0] && notionCount <= expected.expectedNotionRange[1];

        let cardSchemaValid: boolean | null = null;
        let cardCount = 0;
        if (splitResult.ok && splitResult.value[0]) {
          const [firstNotion] = splitResult.value;
          const genResult = await generator.generate({
            notion: { title: firstNotion.title, body: firstNotion.body, difficulty: firstNotion.difficulty },
            types: ["flashcard"],
          });
          cardSchemaValid = genResult.ok;
          cardCount = genResult.ok ? genResult.value.length : 0;
        }

        results.push({
          case: caseName,
          subject: expected.subject,
          splitSchemaValid: splitResult.ok,
          notionCount,
          inExpectedRange,
          cardSchemaValid,
          cardCount,
        });
      }

      mkdirSync(RESULTS_DIR, { recursive: true });
      const date = new Date().toISOString().slice(0, 10);
      const schemaValidRate = results.filter((r) => r.splitSchemaValid).length / results.length;
      const inRangeCount = results.filter((r) => r.inExpectedRange).length;

      const report = [
        `# M3 eval run — ${date}`,
        "",
        "Model: claude-sonnet-4-5 (default, see packages/core/src/shared/model-client.ts)",
        "",
        "| Case | Subject | Split schema valid | Notions | In expected range | Card schema valid |",
        "|---|---|---|---|---|---|",
        ...results.map(
          (r) =>
            `| ${r.case} | ${r.subject} | ${String(r.splitSchemaValid)} | ${String(r.notionCount)} | ${String(r.inExpectedRange)} | ${String(r.cardSchemaValid)} |`,
        ),
        "",
        `Schema validity rate: ${(schemaValidRate * 100).toFixed(0)}%`,
        `Notion count in expected range: ${String(inRangeCount)}/${String(results.length)}`,
        "",
        "The point is the trend across model and prompt changes; a single run tells you almost nothing (docs/TESTING.md).",
      ].join("\n");

      writeFileSync(path.join(RESULTS_DIR, `${date}.md`), report);

      // A schema-invalid result on the golden set means the schema itself
      // (or the prompt) has drifted from what the provider actually
      // returns — fail loudly rather than silently recording a bad run.
      expect(results.every((r) => r.splitSchemaValid)).toBe(true);
    },
    600_000,
  );
});
