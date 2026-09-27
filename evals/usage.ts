import type { createLanguageModel } from "@studia/core";

type Model = ReturnType<typeof createLanguageModel>;
type StreamPart = Awaited<ReturnType<Model["doStream"]>>["stream"] extends ReadableStream<infer Part> ? Part : never;

export interface UsageTally {
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

// Counts every call's tokens so a results file can say what the run cost:
// the eval suites spend real money and nothing else records it. Typed from
// createLanguageModel rather than importing `ai`, which is not a dependency
// of the repo root. doGenerate covers generateObject; doStream covers the
// tutor's streamText, whose usage arrives with the stream's "finish" part.
export function withUsageTally(model: Model): { model: Model; tally: UsageTally } {
  const tally: UsageTally = { calls: 0, inputTokens: 0, outputTokens: 0 };
  const counted = Object.create(model) as Model;
  counted.doGenerate = async (options) => {
    const result = await model.doGenerate(options);
    tally.calls += 1;
    tally.inputTokens += result.usage.promptTokens;
    tally.outputTokens += result.usage.completionTokens;
    return result;
  };
  counted.doStream = async (options) => {
    const result = await model.doStream(options);
    const stream = result.stream.pipeThrough(
      new TransformStream<StreamPart, StreamPart>({
        transform(part, controller) {
          if (part.type === "finish") {
            tally.calls += 1;
            tally.inputTokens += part.usage.promptTokens;
            tally.outputTokens += part.usage.completionTokens;
          }
          controller.enqueue(part);
        },
      }),
    );
    return { ...result, stream };
  };
  return { model: counted, tally };
}

export function usageLine(tally: UsageTally): string {
  return `Usage: ${String(tally.calls)} calls, ${String(tally.inputTokens)} input tokens, ${String(tally.outputTokens)} output tokens`;
}
