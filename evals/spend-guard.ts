import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { createLanguageModel } from "@studia/core";

type Model = ReturnType<typeof createLanguageModel>;

// claude-sonnet-5, Anthropic first-party rates (USD per token), checked
// 2026-10-03: $2 / $10 per million input / output tokens.
export const INPUT_USD_PER_TOKEN = 2 / 1_000_000;
export const OUTPUT_USD_PER_TOKEN = 10 / 1_000_000;
// Conservative: French text ran ~3.5 characters per token on Sonnet 4.5,
// and claude-sonnet-5's tokenizer produces ~30% more tokens.
const CHARS_PER_TOKEN = 2.5;
const PROVIDER_DEFAULT_MAX_TOKENS = 4_096;

export class SpendLimitReached extends Error {}

export type PhaseTally = { calls: number; inputTokens: number; outputTokens: number; usd: number };

type Ledger = { limitUsd: number; spentUsd: number; calls: number };

// Refuses any call whose worst case (estimated input, plus the call's whole
// max_tokens as output) could take the persistent ledger past its limit.
// The ledger file survives between runs, so the limit covers the whole
// mission, not one run. Each call's real cost is added from its usage.
export function guardSpend(model: Model, ledgerPath: string, limitUsd: number) {
  const load = (): Ledger => (existsSync(ledgerPath) ? (JSON.parse(readFileSync(ledgerPath, "utf8")) as Ledger) : { limitUsd, spentUsd: 0, calls: 0 });
  const phases = new Map<string, PhaseTally>();
  let phase = "unlabelled";

  const guarded = Object.create(model) as Model;
  guarded.doGenerate = async (options) => {
    const ledger = load();
    const inputEstimate = JSON.stringify(options.prompt).length / CHARS_PER_TOKEN;
    const worstUsd = inputEstimate * INPUT_USD_PER_TOKEN + (options.maxTokens ?? PROVIDER_DEFAULT_MAX_TOKENS) * OUTPUT_USD_PER_TOKEN;
    if (ledger.spentUsd + worstUsd > limitUsd) {
      throw new SpendLimitReached(`Refused: ${ledger.spentUsd.toFixed(3)} $ spent, this call could cost up to ${worstUsd.toFixed(3)} $, limit ${limitUsd.toFixed(2)} $`);
    }
    const result = await model.doGenerate(options);
    // RAW_DIR: every raw response, to diagnose a schema failure. Outside the
    // repo: responses quote courses that may not be versioned.
    if (process.env.RAW_DIR) {
      appendFileSync(
        path.join(process.env.RAW_DIR, "raw-responses.jsonl"),
        `${JSON.stringify({ phase, finishReason: result.finishReason, usage: result.usage, text: result.text, toolCalls: result.toolCalls })}\n`,
      );
    }
    const usd = result.usage.promptTokens * INPUT_USD_PER_TOKEN + result.usage.completionTokens * OUTPUT_USD_PER_TOKEN;
    writeFileSync(ledgerPath, JSON.stringify({ limitUsd, spentUsd: ledger.spentUsd + usd, calls: ledger.calls + 1 }, null, 2));
    const tally = phases.get(phase) ?? { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 };
    phases.set(phase, {
      calls: tally.calls + 1,
      inputTokens: tally.inputTokens + result.usage.promptTokens,
      outputTokens: tally.outputTokens + result.usage.completionTokens,
      usd: tally.usd + usd,
    });
    return result;
  };

  return {
    model: guarded,
    setPhase: (name: string) => {
      phase = name;
    },
    phases,
    spent: () => load().spentUsd,
  };
}
