import type { createLanguageModel } from "@studia/core";

type Model = ReturnType<typeof createLanguageModel>;
type GenerateResult = Awaited<ReturnType<Model["doGenerate"]>>;

// One real model response, as written by spend-guard.ts (RECORD=1 or
// RAW_DIR): enough to hand generateObject the same tool call again.
export type RecordedCall = {
  phase: string;
  finishReason: GenerateResult["finishReason"];
  usage: GenerateResult["usage"];
  text: string | null | undefined;
  toolCalls: GenerateResult["toolCalls"];
};

export class ReplayMismatch extends Error {}

// Replays recorded responses in order, without any network call or cost
// (CLAUDE.md rule 6: long cases are validated by tests, dry runs and
// recorded responses). Each response must be asked for in the phase it was
// recorded in; a call with no recording left, or in another phase, means
// the pipeline now calls the model differently: re-record (one authorized
// real run), rather than replay answers to questions that changed.
export function replayModel(model: Model, recordings: RecordedCall[], currentPhase: () => string): Model {
  const queue = [...recordings];
  let callNumber = 0;
  const replaying = Object.create(model) as Model;
  replaying.doGenerate = (options) => {
    callNumber += 1;
    const next = queue.shift();
    if (!next) return Promise.reject(new ReplayMismatch(`Call ${String(callNumber)} (${currentPhase()}) has no recorded response left`));
    if (next.phase !== currentPhase()) {
      return Promise.reject(new ReplayMismatch(`Call ${String(callNumber)} is in phase "${currentPhase()}", its recording in "${next.phase}"`));
    }
    return Promise.resolve({
      text: next.text ?? undefined,
      toolCalls: next.toolCalls,
      finishReason: next.finishReason,
      usage: next.usage,
      rawCall: { rawPrompt: options.prompt, rawSettings: {} },
    });
  };
  return replaying;
}
