// Tutor golden-set evaluation (docs/TESTING.md): real API calls, costs
// money, never run in CI, no pass/fail gate on a pull request. Run manually
// with `pnpm eval` and ANTHROPIC_API_KEY set.
//
// Separate results file from run.eval.test.ts's M3/M4 report (both write to
// evals/results/, and this one would otherwise collide on the same
// ${date}.md name) and a separate describe/it: shape doesn't match split +
// generate at all, this measures chat groundedness and refusal.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ClaudeChatModel, ClaudeCitationExtractor, createLanguageModel, splitIntoSections, type Section } from "@studia/core";
import { describe, expect, it } from "vitest";

const GOLDEN_DIR = path.resolve(import.meta.dirname, "golden");
const RESULTS_DIR = path.resolve(import.meta.dirname, "results");

type QuestionKind = "in-scope" | "cross-document" | "out-of-scope";

interface QuestionCase {
  documentCase: string;
  kind: QuestionKind;
  question: string;
}

// One in-scope question per document (measures groundedness), one
// cross-document adversarial question per document -- a subject the golden
// set covers, but under a *different* document than the one asked
// (docs/modules/tutor.md: "the case a threshold used to catch mechanically
// and a prompt now has to catch on its own") -- and one out-of-scope
// question, reused across every document since the point is just "does it
// refuse something unrelated regardless of which course."
const OUT_OF_SCOPE_QUESTION = "Quelle est la capitale de l'Australie ?";

const CASES: QuestionCase[] = [
  { documentCase: "01-svt-photosynthese", kind: "in-scope", question: "Qu'est-ce que la photosynthèse ?" },
  { documentCase: "01-svt-photosynthese", kind: "cross-document", question: "Énonce le théorème de Pythagore." },
  { documentCase: "01-svt-photosynthese", kind: "out-of-scope", question: OUT_OF_SCOPE_QUESTION },

  { documentCase: "02-histoire-revolution", kind: "in-scope", question: "Qu'est-ce que la prise de la Bastille ?" },
  { documentCase: "02-histoire-revolution", kind: "cross-document", question: "Quelle est la différence entre le present perfect et le past simple ?" },
  { documentCase: "02-histoire-revolution", kind: "out-of-scope", question: OUT_OF_SCOPE_QUESTION },

  { documentCase: "03-maths-fonctions", kind: "in-scope", question: "Qu'est-ce que le nombre dérivé ?" },
  { documentCase: "03-maths-fonctions", kind: "cross-document", question: "Que s'est-il passé pendant la Terreur ?" },
  { documentCase: "03-maths-fonctions", kind: "out-of-scope", question: OUT_OF_SCOPE_QUESTION },

  { documentCase: "04-anglais-slides", kind: "in-scope", question: "Quelle est la différence entre le present perfect et le past simple ?" },
  { documentCase: "04-anglais-slides", kind: "cross-document", question: "Qu'est-ce que la photosynthèse ?" },
  { documentCase: "04-anglais-slides", kind: "out-of-scope", question: OUT_OF_SCOPE_QUESTION },

  { documentCase: "05-cours-court", kind: "in-scope", question: "Énonce le théorème de Pythagore." },
  { documentCase: "05-cours-court", kind: "cross-document", question: "Comment calcule-t-on une fonction dérivée ?" },
  { documentCase: "05-cours-court", kind: "out-of-scope", question: OUT_OF_SCOPE_QUESTION },
];

interface QuestionResult {
  documentCase: string;
  kind: QuestionKind;
  question: string;
  expectedGrounded: boolean;
  grounded: boolean;
  correct: boolean;
  citationCount: number;
  extractionOk: boolean;
  answerPreview: string;
}

async function askOnce(
  chatModel: ClaudeChatModel,
  citationExtractor: ClaudeCitationExtractor,
  sections: Section[],
  question: string,
): Promise<{ text: string; grounded: boolean; citationCount: number; extractionOk: boolean }> {
  let text = "";
  for await (const chunk of chatModel.stream({ question, sections, history: [] })) {
    text += chunk;
  }

  const extracted = await citationExtractor.extract({ answer: text, sections });
  const citationCount = extracted.ok ? extracted.value.sectionIndexes.length : 0;
  // Kept distinct from "not grounded": a genuine extraction failure (schema
  // invalid after the adapter's own retry) is a different thing from
  // "legitimately zero citations because the answer was not grounded",
  // same distinction M3's eval draws with splitSchemaValid.
  return { text, grounded: citationCount > 0, citationCount, extractionOk: extracted.ok };
}

describe("M8 tutor golden-set eval", () => {
  it(
    "measures groundedness on in-scope questions and refusal on adversarial ones",
    async () => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          "ANTHROPIC_API_KEY must be set to run pnpm eval (docs/TESTING.md: real API calls, costs money, manual only).",
        );
      }

      const model = createLanguageModel({ apiKey });
      const chatModel = new ClaudeChatModel(model);
      const citationExtractor = new ClaudeCitationExtractor(model);

      const sectionsByCase = new Map<string, Section[]>();
      for (const documentCase of new Set(CASES.map((c) => c.documentCase))) {
        const markdown = readFileSync(path.join(GOLDEN_DIR, documentCase, "input.md"), "utf8");
        sectionsByCase.set(documentCase, splitIntoSections(markdown).map((text, index) => ({ index, text })));
      }

      const results: QuestionResult[] = [];
      for (const questionCase of CASES) {
        const sections = sectionsByCase.get(questionCase.documentCase);
        if (!sections) throw new Error(`no sections built for ${questionCase.documentCase}`);

        const expectedGrounded = questionCase.kind === "in-scope";
        const { text, grounded, citationCount, extractionOk } = await askOnce(chatModel, citationExtractor, sections, questionCase.question);

        results.push({
          documentCase: questionCase.documentCase,
          kind: questionCase.kind,
          question: questionCase.question,
          expectedGrounded,
          grounded,
          correct: grounded === expectedGrounded,
          citationCount,
          extractionOk,
          answerPreview: text.trim().slice(0, 80).replace(/\n/g, " "),
        });
      }

      mkdirSync(RESULTS_DIR, { recursive: true });
      const date = new Date().toISOString().slice(0, 10);

      const inScope = results.filter((r) => r.kind === "in-scope");
      const adversarial = results.filter((r) => r.kind !== "in-scope");
      const groundednessRate = inScope.filter((r) => r.correct).length / inScope.length;
      const refusalRate = adversarial.filter((r) => r.correct).length / adversarial.length;

      const report = [
        `# M8 tutor eval run — ${date}`,
        "",
        "Model: claude-sonnet-4-5 (default, see packages/core/src/shared/model-client.ts)",
        "",
        "| Document | Kind | Question | Expected grounded | Grounded | Correct | Citations | Answer preview |",
        "|---|---|---|---|---|---|---|---|",
        ...results.map(
          (r) =>
            `| ${r.documentCase} | ${r.kind} | ${r.question} | ${String(r.expectedGrounded)} | ${String(r.grounded)} | ${String(r.correct)} | ${String(r.citationCount)} | ${r.answerPreview} |`,
        ),
        "",
        `Groundedness rate (in-scope questions correctly grounded): ${String(inScope.filter((r) => r.correct).length)}/${String(inScope.length)} (${(groundednessRate * 100).toFixed(0)}%)`,
        `Refusal rate (cross-document + out-of-scope questions correctly refused): ${String(adversarial.filter((r) => r.correct).length)}/${String(adversarial.length)} (${(refusalRate * 100).toFixed(0)}%)`,
        "",
        "The point is the trend across model and prompt changes; a single run tells you almost nothing (docs/TESTING.md). Re-run on every system-prompt change (docs/modules/tutor.md).",
      ].join("\n");

      writeFileSync(path.join(RESULTS_DIR, `${date}-tutor.md`), report);

      // A citation-extraction schema failure means the schema (or its
      // prompt) has drifted from what the provider actually returns after a
      // retry -- fail loudly rather than silently recording a bad run, same
      // bar as run.eval.test.ts's splitSchemaValid assertion. Groundedness
      // and refusal rates are trend metrics, not gated here (docs/TESTING.md).
      expect(results).toHaveLength(CASES.length);
      expect(results.every((r) => r.extractionOk)).toBe(true);
    },
    600_000,
  );
});
