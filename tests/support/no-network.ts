type FetchInput = Parameters<typeof fetch>[0];

function urlOf(input: FetchInput): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

globalThis.fetch = (input: FetchInput) => {
  throw new Error(`Network access is disabled in tests. fetch() called with: ${urlOf(input)}`);
};
