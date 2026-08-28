// Golden-set evaluation (docs/TESTING.md): real API calls, costs money,
// never run in CI, no pass/fail gate on a pull request. Run manually with
// `pnpm eval` and ANTHROPIC_API_KEY set.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { answerAmongOptions, areOptionsDistinct, ClaudeCardGenerator, ClaudeNotionSplitter, createLanguageModel, optionLengthsArePlausible } from "@studia/core";
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
  // M4 (docs/MILESTONES.md: "Eval measures distractor quality on the
  // golden set"): mcqCardSchemaValid reflects .refine() enforcement
  // (answer-among-options, distinct options, plausible lengths — all
  // already blocking at generation time, see claude-card-generator.ts).
  // distractorLengthRatio is the extra, non-blocking signal this eval adds:
  // the worst (option length / correct-answer length) ratio per card,
  // averaged — how close a "plausible" pass runs to the 2x/0.5x cutoff.
  mcqCardSchemaValid: boolean | null;
  mcqCardCount: number;
  distractorLengthRatio: number | null;
}

// Average, over every generated mcq card, of the largest deviation between
// any option's length and the correct answer's own length (1.0 = identical
// lengths; the .refine() cutoff already blocks anything past 2.0 or 0.5).
// Purely descriptive: a low ratio close to 1 says distractors read as
// genuinely comparable, not just barely inside the pass/fail line.
function averageDistractorLengthRatio(cards: { answer: string; options: string[] | null }[]): number | null {
  const ratios = cards
    .filter((c) => c.options)
    .map((c) => {
      const answerLength = c.answer.trim().length;
      const worst = Math.max(...c.options!.map((o) => Math.abs(Math.log(o.trim().length / answerLength))));
      return Math.exp(worst);
    });
  if (ratios.length === 0) return null;
  return ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
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
        let mcqCardSchemaValid: boolean | null = null;
        let mcqCardCount = 0;
        let distractorLengthRatio: number | null = null;
        if (splitResult.ok && splitResult.value[0]) {
          const [firstNotion] = splitResult.value;
          const notionInput = { title: firstNotion.title, body: firstNotion.body, difficulty: firstNotion.difficulty };

          const genResult = await generator.generate({ notion: notionInput, types: ["flashcard"] });
          cardSchemaValid = genResult.ok;
          cardCount = genResult.ok ? genResult.value.length : 0;

          const mcqResult = await generator.generate({ notion: notionInput, types: ["mcq"] });
          mcqCardSchemaValid = mcqResult.ok;
          if (mcqResult.ok) {
            mcqCardCount = mcqResult.value.length;
            // Redundant with the generator's own .refine() (which already
            // blocks these), kept here as an independent, visible check
            // that the eval — not just the generator — agrees the golden
            // set's mcq output is sound.
            const allInvariantsHold = mcqResult.value.every(
              (c) => c.options !== null && answerAmongOptions(c.answer, c.options) && areOptionsDistinct(c.options) && optionLengthsArePlausible(c.options),
            );
            expect(allInvariantsHold).toBe(true);
            distractorLengthRatio = averageDistractorLengthRatio(mcqResult.value);
          }
        }

        results.push({
          case: caseName,
          subject: expected.subject,
          splitSchemaValid: splitResult.ok,
          notionCount,
          inExpectedRange,
          cardSchemaValid,
          cardCount,
          mcqCardSchemaValid,
          mcqCardCount,
          distractorLengthRatio,
        });
      }

      mkdirSync(RESULTS_DIR, { recursive: true });
      const date = new Date().toISOString().slice(0, 10);
      const schemaValidRate = results.filter((r) => r.splitSchemaValid).length / results.length;
      const inRangeCount = results.filter((r) => r.inExpectedRange).length;

      const mcqSchemaValidCount = results.filter((r) => r.mcqCardSchemaValid).length;
      const ratios = results.map((r) => r.distractorLengthRatio).filter((r): r is number => r !== null);
      const avgDistractorLengthRatio = ratios.length > 0 ? ratios.reduce((sum, r) => sum + r, 0) / ratios.length : null;

      const report = [
        `# M4 eval run — ${date}`,
        "",
        "Model: claude-sonnet-4-5 (default, see packages/core/src/shared/model-client.ts)",
        "",
        "| Case | Subject | Split schema valid | Notions | In expected range | Card schema valid | MCQ schema valid | MCQ cards | Distractor length ratio |",
        "|---|---|---|---|---|---|---|---|---|",
        ...results.map(
          (r) =>
            `| ${r.case} | ${r.subject} | ${String(r.splitSchemaValid)} | ${String(r.notionCount)} | ${String(r.inExpectedRange)} | ${String(r.cardSchemaValid)} | ${String(r.mcqCardSchemaValid)} | ${String(r.mcqCardCount)} | ${r.distractorLengthRatio ? r.distractorLengthRatio.toFixed(2) : "n/a"} |`,
        ),
        "",
        `Schema validity rate: ${(schemaValidRate * 100).toFixed(0)}%`,
        `Notion count in expected range: ${String(inRangeCount)}/${String(results.length)}`,
        `MCQ schema validity rate (answer among options, distinct, plausible length — all .refine()-enforced): ${String(mcqSchemaValidCount)}/${String(results.length)}`,
        `Average distractor length ratio (1.0 = identical to the answer's length; closer to 1 is more plausible, the .refine() cutoff is ~2.0): ${avgDistractorLengthRatio ? avgDistractorLengthRatio.toFixed(2) : "n/a"}`,
        "",
        "The point is the trend across model and prompt changes; a single run tells you almost nothing (docs/TESTING.md).",
      ].join("\n");

      writeFileSync(path.join(RESULTS_DIR, `${date}.md`), report);

      // A schema-invalid result on the golden set means the schema itself
      // (or the prompt) has drifted from what the provider actually
      // returns — fail loudly rather than silently recording a bad run.
      expect(results.every((r) => r.splitSchemaValid)).toBe(true);
      expect(results.every((r) => r.mcqCardSchemaValid !== false)).toBe(true);
    },
    600_000,
  );
});
