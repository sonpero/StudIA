// M11 eval (docs/MILESTONES.md, docs/reports/notions-cles-conception.md):
// three courses of ~5, ~25 and ~60 pages through the real pipeline
// (splitting, key-notion extraction, batched card generation) on a temp
// SQLite database. Costs money; manual only (pnpm eval).
//
//   CASE=a2a-5p|a2a-25p|revolution-60p  run one course (default: all)
//   DRY=1                               fixture adapters, no network, no cost
//   SPEND_LEDGER=path                   persistent spend ledger (mission limit)
//   A2A_PDF=path                        the A2A course PDF (not versioned)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  CARD_BUDGET,
  ClaudeKeyNotionCardGenerator,
  ClaudeKeyNotionExtractor,
  ClaudeNotionSplitter,
  FixtureKeyNotionCardGenerator,
  FixtureKeyNotionExtractor,
  FixtureNotionSplitter,
  OfficeParserExtractor,
  SqliteDocumentRepository,
  SqliteKeyNotionRepository,
  SqliteNotionRepository,
  cardBudget,
  createLanguageModel,
  handleCourseGenerationJob,
  handleSplitJob,
  normalizeKeyNotionTitle,
  optionLengthsArePlausible,
  uuidV7Generator,
} from "@studia/core";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { freshDb, type Db } from "../tests/support/db.js";
import { guardSpend, SpendLimitReached, type PhaseTally } from "./spend-guard.js";

const MISSION_LIMIT_USD = 10;
const dry = process.env.DRY === "1";
const ledgerPath = process.env.SPEND_LEDGER ?? path.join(tmpdir(), "studia-key-notions-spend.json");
const pdfPath = process.env.A2A_PDF ?? path.resolve("Cours complet le protocole Agent2Agent (A2A).pdf");

type EvalCase = {
  name: string;
  label: string;
  load: () => Promise<string>;
  // Written by hand from each course's own table of contents: an
  // independent check of the extraction's self-declared sections.
  groundTruthSections: string[];
};

async function a2aUpTo(cutHeading: string): Promise<string> {
  const extracted = await new OfficeParserExtractor().extract({ bytes: readFileSync(pdfPath), sourceType: "pdf" });
  if (!extracted.ok) throw new Error(extracted.error.message);
  // The heading also appears in the course's own table of contents; the
  // body's occurrence is the last one.
  return extracted.value.markdown.slice(0, extracted.value.markdown.lastIndexOf(cutHeading)).trim();
}

const CASES: EvalCase[] = [
  {
    name: "a2a-5p",
    label: "A2A, chapitres 1–2 (~5 pages)",
    load: () => a2aUpTo("## 3. Architecture en couches et bindings"),
    groundTruthSections: ["Introduction : pourquoi A2A", "Concepts fondamentaux"],
  },
  {
    name: "a2a-25p",
    label: "A2A, chapitres 1–6 (~25 pages)",
    load: () => a2aUpTo("## 7. A2A face à MCP et aux autres protocoles"),
    groundTruthSections: [
      "Introduction : pourquoi A2A",
      "Concepts fondamentaux",
      "Architecture en couches et bindings",
      "Cycle de vie des tâches, streaming et notifications push",
      "Découverte des agents et Agent Card",
      "Sécurité : authentification, autorisation, confiance",
    ],
  },
  {
    name: "revolution-60p",
    label: "Révolution française, Wikipédia (~67 pages)",
    load: () => Promise.resolve(readFileSync("evals/golden-key-notions/revolution-francaise.md", "utf8")),
    groundTruthSections: [
      "Chronologie et périodisation",
      "La France dans les années 1780",
      "1789 : fin de la monarchie absolue et de l'Ancien Régime",
      "Échec de la monarchie constitutionnelle",
      "Chute de la monarchie, le 10 août 1792",
      "Première République",
    ],
  },
];

const STOP_WORDS = new Set(["de", "du", "des", "la", "le", "les", "l", "d", "et", "en", "a", "au", "aux", "un", "une", "pour", "par", "sur", "dans"]);
const tokens = (text: string) => new Set(normalizeKeyNotionTitle(text).split(" ").filter((t) => t.length > 1 && !STOP_WORDS.has(t)));

function jaccard(a: Set<string>, b: Set<string>): number {
  const inter = [...a].filter((t) => b.has(t)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

type CaseResult = {
  name: string;
  label: string;
  chars: number;
  pages: number;
  readingNotions: number;
  before: { min: number; typical: number; max: number };
  budget: ReturnType<typeof cardBudget>;
  keyNotions: number;
  essentials: number;
  synthesis: number;
  cards: { flashcard: number; mcq: number; open: number; total: number };
  inBounds: { flashcard: boolean; mcq: boolean; open: boolean; total: boolean };
  modelSections: string[];
  modelSectionsUncovered: string[];
  groundTruthUnmatched: string[];
  duplicateTitles: number;
  nearDuplicatePairs: [string, string, number][];
  readingNotionsCovered: number;
  mcqAnswerPositions: number[];
  mcqImplausibleLength: number;
  phases: Record<string, PhaseTally>;
  keyNotionList: { title: string; importance: string; synthesis: boolean; section: string }[];
};

function seed(db: Db, markdown: string, now: Date): void {
  db.run(sql`INSERT INTO users (id, username, password_hash, session_version, created_at) VALUES ('u1', 'eval', 'x', 1, ${now.toISOString()})`);
  db.run(sql`INSERT INTO documents (id, user_id, title, source_type, status, colour, created_at)
      VALUES ('doc-1', 'u1', 'Eval', 'pdf', 'done', '#F87171', ${now.toISOString()})`);
  db.run(sql`INSERT INTO extractions (document_id, markdown, extracted_at) VALUES ('doc-1', ${markdown}, ${now.toISOString()})`);
}

async function runCase(evalCase: EvalCase): Promise<CaseResult> {
  const markdown = await evalCase.load();
  const now = new Date();
  const { db, cleanup } = freshDb();
  try {
    seed(db, markdown, now);
    const guard = guardSpend(createLanguageModel({ apiKey: process.env.ANTHROPIC_API_KEY ?? "", model: process.env.LLM_MODEL }), ledgerPath, MISSION_LIMIT_USD);
    const notionRepo = new SqliteNotionRepository(db);
    const documentRepo = new SqliteDocumentRepository(db);
    const keyNotionRepo = new SqliteKeyNotionRepository(db);
    const ctx = { jobId: "eval", userId: "u1", attempt: 1, now };

    guard.setPhase("découpage");
    const split = await handleSplitJob(
      { notionRepo, documentRepo, splitter: dry ? new FixtureNotionSplitter("valid") : new ClaudeNotionSplitter(guard.model), idGenerator: uuidV7Generator },
      { documentId: "doc-1" },
      ctx,
    );
    if (!split.ok) throw new Error(`split failed: ${split.error}`);

    // Two phases, two passes: the job reuses stored key notions, so a first
    // run whose generator always fails stops right after the extraction.
    guard.setPhase("notions clés");
    const failing = { generate: () => Promise.resolve({ ok: false as const, error: { kind: "model-error" as const, message: "phase boundary" } }) };
    const deps = {
      keyNotionRepo,
      notionRepo,
      documentRepo,
      extractor: dry ? new FixtureKeyNotionExtractor("valid") : new ClaudeKeyNotionExtractor(guard.model),
      idGenerator: uuidV7Generator,
    };
    const extraction = await handleCourseGenerationJob({ ...deps, generator: failing }, { documentId: "doc-1" }, ctx);
    if (!extraction.ok && extraction.error !== "phase boundary") throw new Error(`key-notion extraction failed: ${extraction.error}`);

    guard.setPhase("génération des cartes");
    const generation = await handleCourseGenerationJob(
      { ...deps, generator: dry ? new FixtureKeyNotionCardGenerator("valid") : new ClaudeKeyNotionCardGenerator(guard.model) },
      { documentId: "doc-1" },
      { ...ctx, attempt: 2 },
    );
    if (!generation.ok) throw new Error(`card generation failed: ${generation.error}`);

    const readingNotions = await notionRepo.listNotions("u1", "doc-1");
    const keyNotions = await keyNotionRepo.listKeyNotions("u1", "doc-1");
    const cards = db.all<{ type: "flashcard" | "mcq" | "open"; answer: string; options_json: string | null }>(sql`SELECT type, answer, options_json FROM cards`);
    const count = (type: string) => cards.filter((c) => c.type === type).length;
    const budget = cardBudget(markdown.length);
    const n = readingNotions.length;

    const titles = keyNotions.map((k) => k.title);
    const normalized = titles.map(normalizeKeyNotionTitle);
    const nearDuplicatePairs: [string, string, number][] = [];
    for (let i = 0; i < titles.length; i++) {
      for (let j = i + 1; j < titles.length; j++) {
        const score = jaccard(tokens(titles[i]!), tokens(titles[j]!));
        if (score >= 0.5) nearDuplicatePairs.push([titles[i]!, titles[j]!, Number(score.toFixed(2))]);
      }
    }
    const modelSections = [...new Set(keyNotions.map((k) => k.section))];
    const covered = new Set(keyNotions.flatMap((k) => k.readingNotionIds));
    const mcqs = cards.filter((c) => c.type === "mcq").map((c) => ({ answer: c.answer, options: JSON.parse(c.options_json ?? "[]") as string[] }));
    const cardCounts = { flashcard: count("flashcard"), mcq: count("mcq"), open: count("open"), total: cards.length };

    return {
      name: evalCase.name,
      label: evalCase.label,
      chars: markdown.length,
      pages: Number((markdown.length / CARD_BUDGET.charsPerPage).toFixed(1)),
      readingNotions: n,
      // The 2026-10-03 diagnosis formula: reading notions × 3 types × 1 to 5
      // cards per type and notion, ~3.5 on average.
      before: { min: 3 * n, typical: Math.round(10.5 * n), max: 15 * n },
      budget,
      keyNotions: keyNotions.length,
      essentials: keyNotions.filter((k) => k.importance === "essential").length,
      synthesis: keyNotions.filter((k) => k.isSynthesis).length,
      cards: cardCounts,
      inBounds: {
        flashcard: cardCounts.flashcard >= budget.keyNotions.min && cardCounts.flashcard <= budget.keyNotions.max,
        mcq: cardCounts.mcq >= budget.mcq.min && cardCounts.mcq <= budget.mcq.max,
        open: cardCounts.open >= budget.open.min && cardCounts.open <= budget.open.max,
        total: cardCounts.total <= CARD_BUDGET.totalCardCap,
      },
      modelSections,
      // Every declared section is checked against the key notions kept.
      modelSectionsUncovered: modelSections.filter((s) => !keyNotions.some((k) => k.section === s)),
      groundTruthUnmatched: evalCase.groundTruthSections.filter(
        (truth) => !modelSections.some((s) => jaccard(tokens(truth), tokens(s)) >= 0.5 || normalizeKeyNotionTitle(s).includes(normalizeKeyNotionTitle(truth))),
      ),
      duplicateTitles: normalized.length - new Set(normalized).size,
      nearDuplicatePairs,
      readingNotionsCovered: covered.size,
      mcqAnswerPositions: [0, 1, 2, 3].map((p) => mcqs.filter((m) => m.options.indexOf(m.answer) === p).length),
      mcqImplausibleLength: mcqs.filter((m) => !optionLengthsArePlausible(m.options)).length,
      phases: Object.fromEntries(guard.phases),
      keyNotionList: keyNotions.map((k) => ({ title: k.title, importance: k.importance, synthesis: k.isSynthesis, section: k.section })),
    };
  } finally {
    cleanup();
  }
}

const usd = (value: number) => `${value.toFixed(3)} $`;
const range = (r: { min: number; max: number }) => `${String(r.min)}–${String(r.max)}`;

function report(results: CaseResult[], spentUsd: number): string {
  const lines = [
    `# Eval des notions clés (M11) — ${new Date().toISOString().slice(0, 10)}${dry ? " — DRY RUN (fixtures)" : ""}`,
    "",
    `Modèle : ${process.env.LLM_MODEL ?? "claude-sonnet-5 (défaut)"}. Dépense cumulée de la mission après ce passage : ${usd(spentUsd)} sur ${String(MISSION_LIMIT_USD)} $.`,
    "",
    "## Volume",
    "",
    "| Cours | Car. | Pages | Notions de lecture | Avant (formule : min / typique / max) | Notions clés | Flashcards (borne) | QCM (borne) | Questions libres (borne) | Total |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...results.map(
      (r) =>
        `| ${r.label} | ${String(r.chars)} | ${String(r.pages)} | ${String(r.readingNotions)} | ${String(r.before.min)} / ${String(r.before.typical)} / ${String(r.before.max)} | ${String(r.keyNotions)} (${String(r.essentials)} ess., ${String(r.synthesis)} synth.) | ${String(r.cards.flashcard)} (${range(r.budget.keyNotions)}) ${r.inBounds.flashcard ? "✓" : "✗"} | ${String(r.cards.mcq)} (${range(r.budget.mcq)}) ${r.inBounds.mcq ? "✓" : "✗"} | ${String(r.cards.open)} (${range(r.budget.open)}) ${r.inBounds.open ? "✓" : "✗"} | ${String(r.cards.total)} ${r.inBounds.total ? "✓" : "✗"} |`,
    ),
    "",
    "## Couverture et doublons",
    "",
    "| Cours | Parties déclarées | Parties déclarées sans notion clé | Parties de référence non retrouvées | Doublons de titre | Paires proches (Jaccard ≥ 0,5) | Notions de lecture couvertes |",
    "|---|---|---|---|---|---|---|",
    ...results.map(
      (r) =>
        `| ${r.label} | ${String(r.modelSections.length)} | ${String(r.modelSectionsUncovered.length)} | ${r.groundTruthUnmatched.length === 0 ? "aucune" : r.groundTruthUnmatched.join(" ; ")} | ${String(r.duplicateTitles)} | ${String(r.nearDuplicatePairs.length)} | ${String(r.readingNotionsCovered)} / ${String(r.readingNotions)} |`,
    ),
    "",
    "## QCM",
    "",
    "| Cours | Position de la bonne réponse (1 / 2 / 3 / 4) | Longueurs d'options hors heuristique |",
    "|---|---|---|",
    ...results.map((r) => `| ${r.label} | ${r.mcqAnswerPositions.join(" / ")} | ${String(r.mcqImplausibleLength)} |`),
    "",
    "## Coût et appels",
    "",
    "| Cours | Phase | Appels | Tokens d'entrée | Tokens de sortie | Coût |",
    "|---|---|---|---|---|---|",
    ...results.flatMap((r) =>
      Object.entries(r.phases).map(
        ([phase, t]) => `| ${r.label} | ${phase} | ${String(t.calls)} | ${String(t.inputTokens)} | ${String(t.outputTokens)} | ${usd(t.usd)} |`,
      ),
    ),
    "",
    "## Détail",
    "",
    ...results.flatMap((r) => [
      `### ${r.label}`,
      "",
      `Parties déclarées : ${r.modelSections.map((s) => `« ${s} »`).join(", ")}`,
      "",
      r.nearDuplicatePairs.length > 0 ? `Paires proches : ${r.nearDuplicatePairs.map(([a, b, s]) => `« ${a} » / « ${b} » (${String(s)})`).join(" ; ")}` : "Paires proches : aucune",
      "",
      ...r.keyNotionList.map((k) => `- ${k.title} — ${k.importance === "essential" ? "essentielle" : "importante"}${k.synthesis ? ", synthèse" : ""} — ${k.section}`),
      "",
    ]),
  ];
  return lines.join("\n");
}

describe("M11 key-notion eval", () => {
  it(
    "generates within the budget, covers every section, and never repeats a key notion",
    async () => {
      const selected = CASES.filter((c) => !process.env.CASE || process.env.CASE.split(",").includes(c.name));
      const results: CaseResult[] = [];
      for (const evalCase of selected) {
        if (evalCase.name.startsWith("a2a") && !existsSync(pdfPath)) throw new Error(`A2A PDF not found at ${pdfPath}`);
        try {
          results.push(await runCase(evalCase));
        } catch (error) {
          if (error instanceof SpendLimitReached || (error instanceof Error && error.message.includes("Refused:"))) {
            console.error(`[eval] ${evalCase.name} stopped by the spend guard: ${error.message}`);
            break;
          }
          throw error;
        }
      }

      const resultsDir = "evals/results";
      mkdirSync(resultsDir, { recursive: true });
      const stamp = new Date().toISOString().slice(0, 10);
      const suffix = `${dry ? "-dry" : ""}${process.env.CASE ? `-${process.env.CASE.replace(/,/g, "+")}` : ""}`;
      const ledger = existsSync(ledgerPath) ? (JSON.parse(readFileSync(ledgerPath, "utf8")) as { spentUsd: number }) : { spentUsd: 0 };
      const spent = dry ? 0 : ledger.spentUsd;
      writeFileSync(path.join(resultsDir, `${stamp}-key-notions${suffix}.md`), report(results, spent));
      writeFileSync(path.join(resultsDir, `${stamp}-key-notions${suffix}.json`), JSON.stringify(results, null, 2));

      for (const r of results) {
        expect.soft(r.inBounds.total, `${r.name}: total under the cap`).toBe(true);
        expect.soft(r.duplicateTitles, `${r.name}: no duplicate key notion`).toBe(0);
        expect.soft(r.modelSectionsUncovered, `${r.name}: every declared section covered`).toEqual([]);
      }
    },
    3_600_000,
  );
});
