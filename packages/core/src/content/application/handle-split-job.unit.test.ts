import { describe, expect, it } from "vitest";
import { err, ok } from "../../shared/index.js";
import { uuidV7Generator } from "../../shared/index.js";
import { maxNotionCount } from "../domain/is-valid-notion-count.js";
import { notionBudgets } from "../domain/notion-budget.js";
import { notionCountTarget } from "../domain/notion-count-target.js";
import type { NotionSplitter, SplitInput } from "../domain/ports.js";
import { fakeDocumentRepositoryForContent, fakeNotionRepository, fakeNotionSplitter } from "./fakes.js";
import { handleSplitJob } from "./handle-split-job.js";

const now = new Date("2026-01-01T00:00:00.000Z");

function manyNotions(count: number, prefix = "Notion") {
  return Array.from({ length: count }, (_, i) => ({
    title: `${prefix} ${String(i)}`,
    body: `Corps de la notion ${String(i)}.`,
    difficulty: "medium" as const,
  }));
}

describe("handleSplitJob", () => {
  it("writes notions from a single-chunk document, contiguously positioned from 0", async () => {
    const notionRepo = fakeNotionRepository();
    const documentRepo = fakeDocumentRepositoryForContent({
      documentId: "doc-1",
      markdown: "# Chapitre 1\n\nContenu.",
      extractedAt: now.toISOString(),
    });
    const splitter = fakeNotionSplitter(() => Promise.resolve(ok(manyNotions(5))));

    const result = await handleSplitJob(
      { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator },
      { documentId: "doc-1" },
      { jobId: "job-1", userId: "u1", attempt: 1, now },
    );

    expect(result).toEqual({ ok: true, value: undefined });
    const written = await notionRepo.listNotions("u1", "doc-1");
    expect(written).toHaveLength(5);
    expect(written.map((n) => n.position)).toEqual([0, 1, 2, 3, 4]);
    expect(written.every((n) => n.userId === "u1" && n.documentId === "doc-1")).toBe(true);
  });

  it("is idempotent: running it twice leaves exactly one set of notions", async () => {
    const notionRepo = fakeNotionRepository();
    const documentRepo = fakeDocumentRepositoryForContent({
      documentId: "doc-1",
      markdown: "# Chapitre 1\n\nContenu.",
      extractedAt: now.toISOString(),
    });
    const splitter = fakeNotionSplitter(() => Promise.resolve(ok(manyNotions(5))));
    const deps = { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator };

    await handleSplitJob(deps, { documentId: "doc-1" }, { jobId: "job-1", userId: "u1", attempt: 1, now });
    await handleSplitJob(deps, { documentId: "doc-1" }, { jobId: "job-2", userId: "u1", attempt: 1, now });

    expect(await notionRepo.listNotions("u1", "doc-1")).toHaveLength(5);
  });

  it("renumbers globally across chunks, in chunk order", async () => {
    const notionRepo = fakeNotionRepository();
    const documentRepo = fakeDocumentRepositoryForContent({
      documentId: "doc-1",
      markdown: "# Chapitre 1\n\nA.\n\n# Chapitre 2\n\nB.",
      extractedAt: now.toISOString(),
    });
    let call = 0;
    const splitter = fakeNotionSplitter(() => {
      call += 1;
      return Promise.resolve(ok(manyNotions(3, call === 1 ? "Ch1" : "Ch2")));
    });

    await handleSplitJob(
      { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator, chunking: { targetChars: 20, maxChars: 30 } },
      { documentId: "doc-1" },
      { jobId: "job-1", userId: "u1", attempt: 1, now },
    );

    const written = await notionRepo.listNotions("u1", "doc-1");
    expect(written.map((n) => n.title)).toEqual(["Ch1 0", "Ch1 1", "Ch1 2", "Ch2 0", "Ch2 1", "Ch2 2"]);
    expect(written.map((n) => n.position)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("fails the job when the extraction has no notion.-sized content (no chunks)", async () => {
    const notionRepo = fakeNotionRepository();
    const documentRepo = fakeDocumentRepositoryForContent({ documentId: "doc-1", markdown: "", extractedAt: now.toISOString() });
    const splitter = fakeNotionSplitter();

    const result = await handleSplitJob(
      { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator },
      { documentId: "doc-1" },
      { jobId: "job-1", userId: "u1", attempt: 1, now },
    );

    expect(result.ok).toBe(false);
    expect(await notionRepo.listNotions("u1", "doc-1")).toHaveLength(0);
  });

  it("fails the job when there is no extraction to read", async () => {
    const notionRepo = fakeNotionRepository();
    const documentRepo = fakeDocumentRepositoryForContent(null);
    const splitter = fakeNotionSplitter();

    const result = await handleSplitJob(
      { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator },
      { documentId: "doc-1" },
      { jobId: "job-1", userId: "u1", attempt: 1, now },
    );

    expect(result.ok).toBe(false);
  });

  it("fails the job, without writing anything, when the splitter itself errors", async () => {
    const notionRepo = fakeNotionRepository();
    const documentRepo = fakeDocumentRepositoryForContent({
      documentId: "doc-1",
      markdown: "# Chapitre 1\n\nContenu.",
      extractedAt: now.toISOString(),
    });
    const splitter = fakeNotionSplitter(() => Promise.resolve(err({ kind: "model-error", message: "boom" })));

    const result = await handleSplitJob(
      { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator },
      { documentId: "doc-1" },
      { jobId: "job-1", userId: "u1", attempt: 1, now },
    );

    expect(result).toEqual({ ok: false, error: "boom" });
    expect(await notionRepo.listNotions("u1", "doc-1")).toHaveLength(0);
  });

  it("fails the job when the total notion count is outside 5-60, without writing anything", async () => {
    const notionRepo = fakeNotionRepository();
    const documentRepo = fakeDocumentRepositoryForContent({
      documentId: "doc-1",
      markdown: "# Chapitre 1\n\nContenu.",
      extractedAt: now.toISOString(),
    });
    const splitter = fakeNotionSplitter(() => Promise.resolve(ok(manyNotions(3))));

    const result = await handleSplitJob(
      { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator },
      { documentId: "doc-1" },
      { jobId: "job-1", userId: "u1", attempt: 1, now },
    );

    expect(result.ok).toBe(false);
    expect(await notionRepo.listNotions("u1", "doc-1")).toHaveLength(0);
  });

  it("writes every notion, titles made unique, when two chunks independently produce the same titles", async () => {
    const notionRepo = fakeNotionRepository();
    const documentRepo = fakeDocumentRepositoryForContent({
      documentId: "doc-1",
      markdown: "# Chapitre 1\n\nA.\n\n# Chapitre 2\n\nB.",
      extractedAt: now.toISOString(),
    });
    const splitter = fakeNotionSplitter(() => Promise.resolve(ok(manyNotions(5, "Introduction"))));

    const result = await handleSplitJob(
      { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator, chunking: { targetChars: 20, maxChars: 30 } },
      { documentId: "doc-1" },
      { jobId: "job-1", userId: "u1", attempt: 1, now },
    );

    expect(result.ok).toBe(true);
    const titles = (await notionRepo.listNotions("u1", "doc-1")).map((n) => n.title);
    expect(titles).toHaveLength(10);
    expect(new Set(titles.map((t) => t.toLowerCase())).size).toBe(10);
  });

  describe("long documents", () => {
    // 30 paragraphs of 1 000 characters and not a single `#` heading: the
    // shape of a flat PDF extraction.
    const longFlatMarkdown = Array.from({ length: 30 }, (_, i) => `P${String(i)} ${"x".repeat(996)}`).join("\n\n");

    it("splits by size, not by top-level heading: no chunk above the 15 000-character hard max", async () => {
      const notionRepo = fakeNotionRepository();
      const documentRepo = fakeDocumentRepositoryForContent({ documentId: "doc-1", markdown: longFlatMarkdown, extractedAt: now.toISOString() });
      const seen: string[] = [];
      let call = 0;
      const splitter = fakeNotionSplitter((markdown) => {
        seen.push(markdown);
        call += 1;
        return Promise.resolve(ok(manyNotions(5, `Partie ${String(call)}`)));
      });

      const result = await handleSplitJob(
        { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator },
        { documentId: "doc-1" },
        { jobId: "job-1", userId: "u1", attempt: 1, now },
      );

      expect(result.ok).toBe(true);
      expect(seen.length).toBeGreaterThanOrEqual(2);
      expect(seen.every((chunk) => chunk.length <= 15_000)).toBe(true);
    });

    it("tells the splitter which titles earlier chunks already produced", async () => {
      const notionRepo = fakeNotionRepository();
      const documentRepo = fakeDocumentRepositoryForContent({ documentId: "doc-1", markdown: longFlatMarkdown, extractedAt: now.toISOString() });
      const avoidTitlesSeen: (string[] | undefined)[] = [];
      let call = 0;
      const splitter: NotionSplitter = {
        split: (input) => {
          avoidTitlesSeen.push(input.avoidTitles);
          call += 1;
          return Promise.resolve(ok(manyNotions(5, `Partie ${String(call)}`)));
        },
      };

      await handleSplitJob(
        { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator },
        { documentId: "doc-1" },
        { jobId: "job-1", userId: "u1", attempt: 1, now },
      );

      expect(avoidTitlesSeen[0]).toEqual([]);
      expect(avoidTitlesSeen[1]).toEqual(manyNotions(5, "Partie 1").map((n) => n.title));
    });

    it("accepts more than 60 notions from a long document, up to its length-proportional cap", async () => {
      // 64 000 characters → cap max(60, 64 000 / 500) = 128.
      const markdown = Array.from({ length: 64 }, (_, i) => `P${String(i)} ${"x".repeat(996)}`).join("\n\n").slice(0, 64_000);
      const notionRepo = fakeNotionRepository();
      const documentRepo = fakeDocumentRepositoryForContent({ documentId: "doc-1", markdown, extractedAt: now.toISOString() });
      let call = 0;
      const splitter = fakeNotionSplitter(() => {
        call += 1;
        return Promise.resolve(ok(manyNotions(call === 1 ? 128 : 0, "Notion")));
      });

      const result = await handleSplitJob(
        { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator },
        { documentId: "doc-1" },
        { jobId: "job-1", userId: "u1", attempt: 1, now },
      );

      expect(result).toEqual({ ok: true, value: undefined });
      expect(await notionRepo.listNotions("u1", "doc-1")).toHaveLength(128);
    });

    it("reports the actual bounds when the count is above the cap", async () => {
      const markdown = Array.from({ length: 64 }, (_, i) => `P${String(i)} ${"x".repeat(996)}`).join("\n\n").slice(0, 64_000);
      const notionRepo = fakeNotionRepository();
      const documentRepo = fakeDocumentRepositoryForContent({ documentId: "doc-1", markdown, extractedAt: now.toISOString() });
      let call = 0;
      const splitter = fakeNotionSplitter(() => {
        call += 1;
        return Promise.resolve(ok(manyNotions(call === 1 ? 129 : 0, "Notion")));
      });

      const result = await handleSplitJob(
        { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator },
        { documentId: "doc-1" },
        { jobId: "job-1", userId: "u1", attempt: 1, now },
      );

      expect(result).toEqual({ ok: false, error: "Splitting produced 129 notions, expected 5 to 128", terminal: true });
      expect(await notionRepo.listNotions("u1", "doc-1")).toHaveLength(0);
    });

    it("qualifies a repeated title with its chunk's section instead of failing", async () => {
      const notionRepo = fakeNotionRepository();
      const documentRepo = fakeDocumentRepositoryForContent({
        documentId: "doc-1",
        markdown: "# Chapitre 1\n\nA.\n\n# Chapitre 2\n\nB.",
        extractedAt: now.toISOString(),
      });
      let call = 0;
      const splitter = fakeNotionSplitter(() => {
        call += 1;
        return Promise.resolve(ok([{ title: "Introduction", body: "Corps.", difficulty: "easy" as const }, ...manyNotions(2, `Ch${String(call)}`)]));
      });

      const result = await handleSplitJob(
        { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator, chunking: { targetChars: 20, maxChars: 30 } },
        { documentId: "doc-1" },
        { jobId: "job-1", userId: "u1", attempt: 1, now },
      );

      expect(result.ok).toBe(true);
      const written = await notionRepo.listNotions("u1", "doc-1");
      expect(written.map((n) => n.title)).toEqual(["Introduction", "Ch1 0", "Ch1 1", "Introduction (Chapitre 2)", "Ch2 0", "Ch2 1"]);
    });
  });

  describe("truncated model output", () => {
    it("fails terminally, writing nothing: retrying the same chunk would truncate again", async () => {
      const notionRepo = fakeNotionRepository();
      const documentRepo = fakeDocumentRepositoryForContent({ documentId: "doc-1", markdown: "# Chapitre 1\n\nContenu.", extractedAt: now.toISOString() });
      const splitter = fakeNotionSplitter(() => Promise.resolve(err({ kind: "truncated", message: "cut at 16000 tokens" })));

      const result = await handleSplitJob(
        { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator },
        { documentId: "doc-1" },
        { jobId: "job-1", userId: "u1", attempt: 1, now },
      );

      expect(result).toEqual({ ok: false, error: "cut at 16000 tokens", terminal: true });
      expect(await notionRepo.listNotions("u1", "doc-1")).toHaveLength(0);
    });

    it("leaves any other splitter error retryable (no terminal flag)", async () => {
      const notionRepo = fakeNotionRepository();
      const documentRepo = fakeDocumentRepositoryForContent({ documentId: "doc-1", markdown: "# Chapitre 1\n\nContenu.", extractedAt: now.toISOString() });
      const splitter = fakeNotionSplitter(() => Promise.resolve(err({ kind: "model-error", message: "overloaded" })));

      const result = await handleSplitJob(
        { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator },
        { documentId: "doc-1" },
        { jobId: "job-1", userId: "u1", attempt: 1, now },
      );

      expect(result.ok).toBe(false);
      expect("terminal" in result).toBe(false);
    });
  });
  describe("granularity after the first real run (315 notions for A2A)", () => {
    const longFlatMarkdown = Array.from({ length: 30 }, (_, i) => `P${String(i)} ${"x".repeat(996)}`).join("\n\n");

    it("asks the splitter for a notion count proportional to each chunk's length", async () => {
      const notionRepo = fakeNotionRepository();
      const documentRepo = fakeDocumentRepositoryForContent({ documentId: "doc-1", markdown: longFlatMarkdown, extractedAt: now.toISOString() });
      const seen: { length: number; target: SplitInput["targetNotions"] }[] = [];
      let call = 0;
      const splitter: NotionSplitter = {
        split: (input) => {
          seen.push({ length: input.markdown.length, target: input.targetNotions });
          call += 1;
          return Promise.resolve(ok(manyNotions(5, `Partie ${String(call)}`)));
        },
      };

      await handleSplitJob(
        { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator },
        { documentId: "doc-1" },
        { jobId: "job-1", userId: "u1", attempt: 1, now },
      );

      expect(seen.length).toBeGreaterThanOrEqual(2);
      for (const { length, target } of seen) expect(target).toEqual(notionCountTarget(length, { onlyChunk: false }));
    });

    it("asks a document that fits in one chunk for at least the document's 5-notion floor", async () => {
      const notionRepo = fakeNotionRepository();
      const documentRepo = fakeDocumentRepositoryForContent({ documentId: "doc-1", markdown: "# Chapitre 1\n\nContenu.", extractedAt: now.toISOString() });
      const targets: SplitInput["targetNotions"][] = [];
      const splitter: NotionSplitter = {
        split: (input) => {
          targets.push(input.targetNotions);
          return Promise.resolve(ok(manyNotions(5)));
        },
      };

      await handleSplitJob(
        { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator },
        { documentId: "doc-1" },
        { jobId: "job-1", userId: "u1", attempt: 1, now },
      );

      expect(targets).toEqual([{ min: 5, max: 5 }]);
    });

    it("leaves the 5-notion floor to the document, not to each of several small chunks", async () => {
      const notionRepo = fakeNotionRepository();
      const documentRepo = fakeDocumentRepositoryForContent({
        documentId: "doc-1",
        markdown: "# Chapitre 1\n\nA.\n\n# Chapitre 2\n\nB.",
        extractedAt: now.toISOString(),
      });
      const targets: SplitInput["targetNotions"][] = [];
      let call = 0;
      const splitter: NotionSplitter = {
        split: (input) => {
          targets.push(input.targetNotions);
          call += 1;
          return Promise.resolve(ok(manyNotions(3, `Ch${String(call)}`)));
        },
      };

      await handleSplitJob(
        { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator, chunking: { targetChars: 20, maxChars: 30 } },
        { documentId: "doc-1" },
        { jobId: "job-1", userId: "u1", attempt: 1, now },
      );

      expect(targets).toEqual([
        { min: 1, max: 1 },
        { min: 1, max: 1 },
      ]);
    });

    it("gives each chunk a notion budget from its share of the text, summing to the document's cap", async () => {
      const notionRepo = fakeNotionRepository();
      const documentRepo = fakeDocumentRepositoryForContent({ documentId: "doc-1", markdown: longFlatMarkdown, extractedAt: now.toISOString() });
      const seen: { length: number; budget: SplitInput["maxNotions"]; target: SplitInput["targetNotions"] }[] = [];
      let call = 0;
      const splitter: NotionSplitter = {
        split: (input) => {
          seen.push({ length: input.markdown.length, budget: input.maxNotions, target: input.targetNotions });
          call += 1;
          return Promise.resolve(ok(manyNotions(5, `Partie ${String(call)}`)));
        },
      };

      await handleSplitJob(
        { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator },
        { documentId: "doc-1" },
        { jobId: "job-1", userId: "u1", attempt: 1, now },
      );

      expect(seen.length).toBeGreaterThanOrEqual(2);
      expect(seen.map((s) => s.budget)).toEqual(notionBudgets(seen.map((s) => s.length), maxNotionCount(longFlatMarkdown.length)));
      expect(seen.reduce((total, s) => total + (s.budget ?? 0), 0)).toBe(maxNotionCount(longFlatMarkdown.length));
      for (const { budget, target } of seen) expect(target?.max).toBeLessThanOrEqual(budget ?? 0);
    });

    it("fails terminally when the count is above the cap: a full paid re-split would overshoot again", async () => {
      const notionRepo = fakeNotionRepository();
      const documentRepo = fakeDocumentRepositoryForContent({ documentId: "doc-1", markdown: "# Chapitre 1\n\nContenu.", extractedAt: now.toISOString() });
      const splitter = fakeNotionSplitter(() => Promise.resolve(ok(manyNotions(61))));

      const result = await handleSplitJob(
        { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator },
        { documentId: "doc-1" },
        { jobId: "job-1", userId: "u1", attempt: 1, now },
      );

      expect(result).toEqual({ ok: false, error: "Splitting produced 61 notions, expected 5 to 60", terminal: true });
    });

    it("leaves a count below the floor retryable", async () => {
      const notionRepo = fakeNotionRepository();
      const documentRepo = fakeDocumentRepositoryForContent({ documentId: "doc-1", markdown: "# Chapitre 1\n\nContenu.", extractedAt: now.toISOString() });
      const splitter = fakeNotionSplitter(() => Promise.resolve(ok(manyNotions(3))));

      const result = await handleSplitJob(
        { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator },
        { documentId: "doc-1" },
        { jobId: "job-1", userId: "u1", attempt: 1, now },
      );

      expect(result).toEqual({ ok: false, error: "Splitting produced 3 notions, expected 5 to 60" });
    });
  });

  // A2A in production (2026-09-27): one 82-character title failed the whole
  // document after every chunk, three times over. 80 is now an instruction
  // to the model, tolerated up to 100 and repaired beyond, never a rejection.
  describe("titles over the 80 characters the model is asked for", () => {
    const productionTitle = "Inconvénients d'A2A : sécurité à la charge de l'implémenteur et webhooks exigeants";
    const securityTitle = "Sécurité d'A2A : authentification des agents, jetons à portée réduite, échange de jetons (RFC 8693)";

    it("writes the real 82-character production title unchanged", async () => {
      const notionRepo = fakeNotionRepository();
      const documentRepo = fakeDocumentRepositoryForContent({ documentId: "doc-1", markdown: "# Chapitre 1\n\nContenu.", extractedAt: now.toISOString() });
      const splitter = fakeNotionSplitter(() =>
        Promise.resolve(ok([{ title: productionTitle, body: "Corps.", difficulty: "medium" as const }, ...manyNotions(4)])),
      );

      const result = await handleSplitJob(
        { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator },
        { documentId: "doc-1" },
        { jobId: "job-1", userId: "u1", attempt: 1, now },
      );

      expect(result).toEqual({ ok: true, value: undefined });
      expect((await notionRepo.listNotions("u1", "doc-1"))[0]?.title).toBe(productionTitle);
    });

    it("shortens a title over 100 characters instead of failing the job", async () => {
      const notionRepo = fakeNotionRepository();
      const documentRepo = fakeDocumentRepositoryForContent({ documentId: "doc-1", markdown: "# Chapitre 1\n\nContenu.", extractedAt: now.toISOString() });
      const splitter = fakeNotionSplitter(() =>
        Promise.resolve(ok([{ title: `${securityTitle} et audience restreinte`, body: "Corps.", difficulty: "hard" as const }, ...manyNotions(4)])),
      );

      const result = await handleSplitJob(
        { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator },
        { documentId: "doc-1" },
        { jobId: "job-1", userId: "u1", attempt: 1, now },
      );

      expect(result).toEqual({ ok: true, value: undefined });
      expect((await notionRepo.listNotions("u1", "doc-1"))[0]?.title).toBe(securityTitle);
    });

    it("resolves a collision created by shortening, through the usual section qualifier", async () => {
      const notionRepo = fakeNotionRepository();
      const documentRepo = fakeDocumentRepositoryForContent({
        documentId: "doc-1",
        markdown: "# Chapitre 1\n\nA.\n\n# Chapitre 2\n\nB.",
        extractedAt: now.toISOString(),
      });
      let call = 0;
      const splitter = fakeNotionSplitter(() => {
        call += 1;
        const tail = call === 1 ? "et audience restreinte" : "et durée de vie courte";
        return Promise.resolve(ok([{ title: `${securityTitle} ${tail}`, body: "Corps.", difficulty: "hard" as const }, ...manyNotions(2, `Ch${String(call)}`)]));
      });

      const result = await handleSplitJob(
        { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator, chunking: { targetChars: 20, maxChars: 30 } },
        { documentId: "doc-1" },
        { jobId: "job-1", userId: "u1", attempt: 1, now },
      );

      expect(result.ok).toBe(true);
      const titles = (await notionRepo.listNotions("u1", "doc-1")).map((n) => n.title);
      expect(titles[0]).toBe(securityTitle);
      expect(titles[3]).toBe("Sécurité d'A2A : authentification des agents, jetons à portée rédui (Chapitre 2)");
    });

    it("still fails the job, retryably, on a title under 3 characters", async () => {
      const notionRepo = fakeNotionRepository();
      const documentRepo = fakeDocumentRepositoryForContent({ documentId: "doc-1", markdown: "# Chapitre 1\n\nContenu.", extractedAt: now.toISOString() });
      const splitter = fakeNotionSplitter(() => Promise.resolve(ok([{ title: "Hi", body: "Corps.", difficulty: "easy" as const }, ...manyNotions(4)])));

      const result = await handleSplitJob(
        { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator },
        { documentId: "doc-1" },
        { jobId: "job-1", userId: "u1", attempt: 1, now },
      );

      expect(result).toEqual({ ok: false, error: 'Invalid notion title: "Hi"' });
      expect(await notionRepo.listNotions("u1", "doc-1")).toEqual([]);
    });
  });
});
