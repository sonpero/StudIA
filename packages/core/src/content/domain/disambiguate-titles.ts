// Safety net for titles repeated across chunks (docs/modules/content.md,
// "Duplicate titles across chunks"). The splitter is told which titles
// earlier chunks already used, but a model can still repeat one, and two
// chunks of the same course legitimately both have an "Introduction". A
// repeat used to fail the whole document; it is now resolved here,
// deterministically and without another model call: the first occurrence
// keeps its title, a later one is qualified with the section it came from.

const MAX_TITLE_LENGTH = 80;
// Long enough for any real section title's gist, short enough to leave most
// of the 80 characters to the notion's own title.
const MAX_LABEL_LENGTH = 40;

export type TitleSource = {
  title: string;
  // The heading the notion's chunk opens its content with (sectionLabel),
  // null when the chunk has none.
  section: string | null;
  // 1-based chunk number, the fallback qualifier.
  part: number;
};

const HEADING = /^#{1,6}\s+(.+)$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

// The chunk's first heading outside a fenced code block: the nearest section
// title the chunk's notions can be attributed to, since a notion does not
// say where in its chunk it came from.
export function sectionLabel(chunk: string): string | null {
  let inFence = false;
  for (const line of chunk.split("\n")) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    const heading = inFence ? null : HEADING.exec(line);
    if (heading?.[1]) return heading[1].trim();
  }
  return null;
}

function normalize(title: string): string {
  return title.trim().toLowerCase();
}

function qualify(title: string, qualifier: string): string {
  const suffix = ` (${qualifier})`;
  return `${title.trim().slice(0, MAX_TITLE_LENGTH - suffix.length).trimEnd()}${suffix}`;
}

export function disambiguateTitles(sources: TitleSource[]): string[] {
  const used = new Set<string>();

  return sources.map(({ title, section, part }) => {
    let resolved = title;
    if (used.has(normalize(title))) {
      const label =
        section !== null && normalize(section) !== normalize(title) ? section.slice(0, MAX_LABEL_LENGTH).trimEnd() : `partie ${String(part)}`;
      resolved = qualify(title, label);
      for (let n = 2; used.has(normalize(resolved)); n++) resolved = qualify(title, `${label} ${String(n)}`);
    }
    used.add(normalize(resolved));
    return resolved;
  });
}
