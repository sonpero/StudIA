import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

export interface ModelClientConfig {
  apiKey: string;
  model?: string;
}

const DEFAULT_MODEL = "claude-sonnet-4-5";

// The one factory every real LLM adapter builds its client from (never used
// by fixture adapters, which is what keeps `pnpm test` network-free). Takes
// its config as a parameter rather than reading process.env itself, same
// convention as HmacSessionCodec/Argon2PasswordHasher: the caller (apps/api
// wiring) reads env and passes it down.
export function createLanguageModel(config: ModelClientConfig): LanguageModel {
  const anthropic = createAnthropic({ apiKey: config.apiKey });
  return anthropic(config.model ?? DEFAULT_MODEL);
}
