import { createAnthropic } from "@ai-sdk/anthropic";
import { wrapLanguageModel, type LanguageModel, type LanguageModelV1Middleware } from "ai";

export interface ModelClientConfig {
  apiKey: string;
  model?: string;
}

const DEFAULT_MODEL = "claude-sonnet-5";

// ai@4.x fills `temperature: 0` into every call no adapter here sets it, and
// claude-sonnet-5 (like every model from Opus 4.7 on) answers any non-default
// temperature/top_p/top_k with a 400. No adapter tunes sampling on purpose,
// so they are stripped for every model rather than per model id.
const omitSamplingParams: LanguageModelV1Middleware = {
  transformParams: ({ params }) => Promise.resolve({ ...params, temperature: undefined, topP: undefined, topK: undefined }),
};

// The one factory every real LLM adapter builds its client from (never used
// by fixture adapters, which is what keeps `pnpm test` network-free). Takes
// its config as a parameter rather than reading process.env itself, same
// convention as HmacSessionCodec/Argon2PasswordHasher: the caller (apps/api
// wiring) reads env and passes it down.
export function createLanguageModel(config: ModelClientConfig): LanguageModel {
  const anthropic = createAnthropic({ apiKey: config.apiKey });
  const modelId = config.model?.trim() || DEFAULT_MODEL;
  return wrapLanguageModel({ model: anthropic(modelId), middleware: omitSamplingParams });
}
