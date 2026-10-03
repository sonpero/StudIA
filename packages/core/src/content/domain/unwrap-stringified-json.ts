// claude-sonnet-5 sometimes returns a tool call whose array field is itself
// a JSON-encoded string (`{"elements": "[{...}]"}`), which fails the schema
// although the content is fine (2026-10-03 eval, docs/reports/
// notions-cles-decisions.md D19). Used as generateObject's
// experimental_repairText: returns the repaired text, or null to let the
// original validation error stand.
export function unwrapStringifiedJson(text: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;

  let changed = false;
  const repaired: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    repaired[key] = value;
    if (typeof value !== "string" || !/^\s*[[{]/.test(value)) continue;
    try {
      repaired[key] = JSON.parse(value);
      changed = true;
    } catch {
      // Text that merely starts with a bracket: left as it is.
    }
  }
  return changed ? JSON.stringify(repaired) : null;
}
