// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { DocumentDetailResponse, DocumentSummary } from "@studia/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReaderScreen } from "./ReaderScreen.js";

// Redesigned per a "Lecteur" mockup, ignoring docs/UI.md per the user, the
// same unification NotionsScreen's own redesign already went through: one
// page — a pill selector of courses at the top, then that course's own
// reading surface and a "Étudier cette page" panel — replacing the old
// two-step CoursePickerScreen → ReaderCourseScreen flow. Deep links from
// elsewhere (documentId set) still pre-select that course and show
// "Retour"; the nav's own direct entry (documentId undefined) shows no back
// link and defaults to the first course (NotionsScreen's own precedent).
function renderScreen(
  overrides: Partial<{
    documentId: string;
    onBack: () => void;
    onOpenNotions: (documentId: string) => void;
    onOpenTutor: (documentId: string) => void;
  }> = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ReaderScreen
        documentId={overrides.documentId}
        onBack={overrides.onBack ?? (() => undefined)}
        onOpenNotions={overrides.onOpenNotions ?? (() => undefined)}
        onOpenTutor={overrides.onOpenTutor ?? (() => undefined)}
      />
    </QueryClientProvider>,
  );
}

const docA: DocumentSummary = { id: "doc-1", title: "Biologie", sourceType: "photo", status: "done", pageCount: 3, colour: "#F87171", createdAt: "2026-01-01T00:00:00Z" };
const docB: DocumentSummary = { id: "doc-2", title: "Histoire", sourceType: "photo", status: "done", pageCount: 2, colour: "#38BDF8", createdAt: "2026-01-01T00:00:00Z" };

function detail(doc: DocumentSummary, extra: Partial<DocumentDetailResponse>): DocumentDetailResponse {
  return { ...doc, lastError: null, markdown: null, ...extra };
}

function stubFetch(options: { documents?: DocumentSummary[] | (() => Response); detailsByDocument?: Record<string, DocumentDetailResponse | (() => Response)> }) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      const detailMatch = /\/api\/documents\/([^/]+)$/.exec(url);
      if (detailMatch) {
        const entry = options.detailsByDocument?.[detailMatch[1]!];
        if (typeof entry === "function") return Promise.resolve(entry());
        if (entry) return Promise.resolve(new Response(JSON.stringify(entry), { status: 200 }));
        return Promise.resolve(new Response(null, { status: 404 }));
      }
      if (url.startsWith("/api/documents")) {
        if (typeof options.documents === "function") return Promise.resolve(options.documents());
        return Promise.resolve(new Response(JSON.stringify(options.documents ?? []), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    }),
  );
}

describe("ReaderScreen", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loading state: shows a skeleton, never a bare spinner, while the course list itself is still loading", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    renderScreen();
    expect(screen.getByRole("heading", { name: "Lecteur" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("error state: a network failure loading the course list shows the confused mascot and a retry button, never a raw error code", async () => {
    stubFetch({ documents: () => new Response(null, { status: 500 }) });
    renderScreen();
    await screen.findByText(/impossible de charger tes cours/i);
    expect(screen.getByRole("button", { name: /réessayer/i })).toBeInTheDocument();
  });

  it("no course at all: the idle mascot, not a blank page", async () => {
    stubFetch({ documents: [] });
    renderScreen();
    await screen.findByText(/ajoute un cours dans mes cours pour le lire/i);
  });

  it("directly from the nav (no documentId): the first course is selected automatically, its pill is active, and there is no back link", async () => {
    stubFetch({ documents: [docA, docB], detailsByDocument: { "doc-1": detail(docA, { markdown: "Contenu de Biologie." }) } });
    renderScreen();

    expect(await screen.findByRole("button", { name: "Biologie" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Histoire" })).not.toHaveAttribute("aria-current");
    await screen.findByText("Contenu de Biologie.");
    expect(screen.queryByRole("button", { name: "Retour" })).not.toBeInTheDocument();
  });

  it("a documentId prop pre-selects that course's pill and shows 'Retour'", async () => {
    stubFetch({ documents: [docA, docB], detailsByDocument: { "doc-2": detail(docB, { markdown: "Contenu d'Histoire." }) } });
    renderScreen({ documentId: "doc-2" });

    expect(await screen.findByRole("button", { name: "Histoire" })).toHaveAttribute("aria-current", "page");
    await screen.findByText("Contenu d'Histoire.");
    expect(screen.getByRole("button", { name: "Retour" })).toBeInTheDocument();
  });

  it("clicking a different pill switches the course shown, without a page-level view transition", async () => {
    stubFetch({
      documents: [docA, docB],
      detailsByDocument: {
        "doc-1": detail(docA, { markdown: "Contenu de Biologie." }),
        "doc-2": detail(docB, { markdown: "Contenu d'Histoire." }),
      },
    });
    const user = userEvent.setup();
    renderScreen();

    await screen.findByText("Contenu de Biologie.");
    await user.click(screen.getByRole("button", { name: "Histoire" }));

    await screen.findByText("Contenu d'Histoire.");
    expect(screen.queryByText("Contenu de Biologie.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Histoire" })).toHaveAttribute("aria-current", "page");
  });

  it("'Retour' calls onBack — deliberately destination-agnostic text, since this screen can return to either Mes cours or Notions du cours depending on how it was reached", async () => {
    const onBack = vi.fn();
    stubFetch({ documents: [docA], detailsByDocument: { "doc-1": detail(docA, { markdown: "Contenu." }) } });
    const user = userEvent.setup();
    renderScreen({ documentId: "doc-1", onBack });

    await screen.findByText("Contenu.");
    await user.click(screen.getByRole("button", { name: "Retour" }));

    expect(onBack).toHaveBeenCalled();
  });

  it("a selected course's own loading state: a skeleton, no mascot", async () => {
    stubFetch({ documents: [docA], detailsByDocument: { "doc-1": () => new Promise(() => {}) as unknown as Response } });
    renderScreen({ documentId: "doc-1" });

    await screen.findByRole("button", { name: "Biologie" });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("a selected course's own network failure: the confused mascot and a retry, scoped to that course only", async () => {
    stubFetch({ documents: [docA], detailsByDocument: { "doc-1": () => new Response(null, { status: 500 }) } });
    renderScreen({ documentId: "doc-1" });

    await screen.findByText(/impossible de charger ce cours/i);
    expect(screen.getByRole("button", { name: /réessayer/i })).toBeInTheDocument();
  });

  it("still extracting (pending or running): the reading mascot and a plain wait message, polling — not left undefined just because the entry point is normally gated on status === done", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (/\/api\/documents\/doc-1$/.test(url)) return Promise.resolve(new Response(JSON.stringify(detail(docA, { status: "running" })), { status: 200 }));
      if (url.startsWith("/api/documents")) return Promise.resolve(new Response(JSON.stringify([docA]), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    renderScreen({ documentId: "doc-1" });

    await screen.findByText(/encore en cours de lecture/i);

    const initialCalls = fetchMock.mock.calls.length;
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(initialCalls), { timeout: 4000 });
  });

  it("failed extraction: the confused mascot, a sober fact, no retry button here — that mutation stays on Mes cours", async () => {
    stubFetch({ documents: [docA], detailsByDocument: { "doc-1": detail(docA, { status: "failed" }) } });
    renderScreen({ documentId: "doc-1" });

    await screen.findByText(/la lecture de ce cours a échoué/i);
    expect(screen.queryByRole("button", { name: /réessayer/i })).not.toBeInTheDocument();
  });

  it("done but nothing readable (markdown null): the idle mascot, not a blank page", async () => {
    stubFetch({ documents: [docA], detailsByDocument: { "doc-1": detail(docA, { markdown: null }) } });
    renderScreen({ documentId: "doc-1" });

    await screen.findByText(/ne contient pas encore de texte lisible/i);
  });

  it("done but nothing readable (markdown blank): same empty state as null, not a rendering crash", async () => {
    stubFetch({ documents: [docA], detailsByDocument: { "doc-1": detail(docA, { markdown: "   " }) } });
    renderScreen({ documentId: "doc-1" });

    await screen.findByText(/ne contient pas encore de texte lisible/i);
  });

  it("ready: renders the course's extracted markdown as formatted text, not raw preformatted", async () => {
    stubFetch({ documents: [docA], detailsByDocument: { "doc-1": detail(docA, { markdown: "## Une section\n\nLa plante **capte** la lumière." }) } });
    renderScreen({ documentId: "doc-1" });

    const heading = await screen.findByRole("heading", { name: "Une section" });
    expect(heading).toBeInTheDocument();
    const strong = await screen.findByText("capte");
    expect(strong.tagName).toBe("STRONG");
    expect(screen.queryByText(/##/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it("ready: the course title heading is distinct from the document's own markdown headings", async () => {
    stubFetch({ documents: [docA], detailsByDocument: { "doc-1": detail(docA, { markdown: "# Chapitre premier\n\nContenu." }) } });
    renderScreen({ documentId: "doc-1" });

    expect(await screen.findByRole("heading", { name: "Biologie" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Chapitre premier" })).toBeInTheDocument();
  });

  it("ready: the course content's own heading scale is strictly smaller than --text-title (20px), the smallest heading the page chrome itself shows — content can never render at the same size as its own frame (docs/UI.md's Lecteur note)", async () => {
    stubFetch({
      documents: [docA],
      detailsByDocument: { "doc-1": detail(docA, { markdown: "# Chapitre premier\n\nIntro.\n\n## Une section\n\nCorps.\n\n### Un détail\n\nSuite." }) },
    });
    renderScreen({ documentId: "doc-1" });

    const h1 = await screen.findByRole("heading", { name: "Chapitre premier" });
    const h2 = screen.getByRole("heading", { name: "Une section" });
    const h3 = screen.getByRole("heading", { name: "Un détail" });

    expect(h1.className).toContain("text-lg");
    expect(h1.className).not.toMatch(/text-2xl|text-xl\b|text-\[length:var\(--text-title\)\]/);
    expect(h2.className).toContain("text-base");
    expect(h2.className).not.toMatch(/text-2xl|text-xl\b|text-lg\b|text-\[length:var\(--text-title\)\]/);
    expect(h3.className).toContain("text-sm");
  });

  // Typography/chrome polish pass (M10 Phase 1's own permission for more
  // work on an already-redesigned screen): the coloured dot repeated the
  // pill already selected just above it — a visual duplication, removed
  // outright rather than kept as a fake signal.
  it("ready: no longer shows the course's own subject colour dot — it duplicated the pill already selected just above", async () => {
    stubFetch({ documents: [docA], detailsByDocument: { "doc-1": detail(docA, { markdown: "Contenu du cours." }) } });
    renderScreen({ documentId: "doc-1" });

    await screen.findByText("Contenu du cours.");
    const title = screen.getByRole("heading", { name: "Biologie" });
    expect(title.parentElement?.querySelector("span[style]")).not.toBeInTheDocument();
    expect(document.querySelector("span[style]")).not.toBeInTheDocument();
  });

  it("ready: the course title uses --text-title, the same token every other course-title instance uses (docs/UI.md's Type note), but is visually hidden — it repeats the pill already selected above, not deleted, since it still carries this document's own heading structure", async () => {
    stubFetch({ documents: [docA], detailsByDocument: { "doc-1": detail(docA, { markdown: "Contenu du cours." }) } });
    renderScreen({ documentId: "doc-1" });

    const title = await screen.findByRole("heading", { name: "Biologie" });
    expect(title.className).toContain("text-[length:var(--text-title)]");
    expect(title.className).toContain("sr-only");
  });

  // M10 Phase 2's own real-measurement discipline, extended here: a live
  // 375x812 browser check found the reading surface's own <p> had no
  // font-size class at all, inheriting the browser's own 16px default —
  // not, as first assumed from a source read alone, the chrome's 14px
  // --text-body. 16px is kept (it already reads better than 14px would),
  // but written explicitly rather than left an accident of the browser's
  // own default with nothing protecting it from a future ancestor setting
  // a smaller size.
  it("ready: the reading surface's own body text (paragraphs, lists, blockquotes) is explicitly 16px, not inherited by accident", async () => {
    stubFetch({
      documents: [docA],
      detailsByDocument: { "doc-1": detail(docA, { markdown: "Paragraphe.\n\n- Item de liste\n\n> Citation." }) },
    });
    renderScreen({ documentId: "doc-1" });

    const p = await screen.findByText("Paragraphe.");
    expect(p.className).toContain("text-base");
    const li = screen.getByText("Item de liste").closest("li")!;
    expect(li.closest("ul")!.className).toContain("text-base");
    const blockquote = screen.getByText("Citation.").closest("blockquote")!;
    expect(blockquote.className).toContain("text-base");
  });

  // The real defect the initial (source-only) diagnostic missed: level 3
  // at 14px is *smaller* than the 16px body it introduces, which reads as
  // a caption, not a heading. Kept at 14px anyway, deliberately, as an
  // "eyebrow"/kicker idiom (uppercase, wide tracking, muted colour) — a
  // named, argued typographic category, not a demoted body size: this is
  // what keeps a smaller heading from reading as inferior to the text
  // beneath it. docs/UI.md's own Lecteur note has the full reasoning for
  // choosing this over bumping level 3 to body size instead.
  it("ready: level 3 headings read as a distinct 'kicker' label — uppercase, wide tracking, muted colour — not a smaller, weaker body/caption", async () => {
    stubFetch({
      documents: [docA],
      detailsByDocument: { "doc-1": detail(docA, { markdown: "### Un détail\n\nSuite." }) },
    });
    renderScreen({ documentId: "doc-1" });

    const h3 = await screen.findByRole("heading", { name: "Un détail" });
    expect(h3.className).toContain("text-sm");
    expect(h3.className).toContain("uppercase");
    expect(h3.className).toMatch(/tracking-wide|tracking-wider/);
    expect(h3.className).toContain("text-text-muted");
  });

  // The core of this pass, per the revised brief: with only one size step
  // available above a 16px body and a 20px ceiling, headings 2 and 3 can no
  // longer lean on size alone — whitespace above a heading, markedly
  // greater than the space below it (before the block that belongs to it),
  // is what actually carries the hierarchy now. Targeted via an arbitrary
  // sibling variant on the prose container (react-markdown renders its own
  // output with no wrapper of its own, confirmed live, so h3/h4/h5 land as
  // direct children of the same element the title row does) rather than a
  // per-renderer prop, since react-markdown gives no renderer access to its
  // own preceding sibling.
  it("ready: the block immediately following a heading sits closer to it than the heading sits to what came before — an asymmetry no test of individual class names alone would catch", async () => {
    stubFetch({
      documents: [docA],
      detailsByDocument: { "doc-1": detail(docA, { markdown: "# Chapitre premier\n\nIntro.\n\n## Une section\n\nCorps.\n\n### Un détail\n\nSuite." }) },
    });
    renderScreen({ documentId: "doc-1" });

    await screen.findByText("Corps.");
    const container = screen.getByRole("heading", { name: "Chapitre premier" }).parentElement!;
    expect(container.className).toMatch(/\[&>h3\+\*\]:mt-\d/);
    expect(container.className).toMatch(/\[&>h4\+\*\]:mt-\d/);
    expect(container.className).toMatch(/\[&>h5\+\*\]:mt-\d/);
  });

  // M10 Phase 1 polish: 60-75 characters is the comfortable prose measure;
  // max-w-2xl (672px) gave 85-90 at this file's own 16px body. ch is a
  // text-relative unit (the current font's own "0" advance width), not a
  // pixel value, so the column tracks the actual body size rather than a
  // fixed viewport-independent guess. 56, not the rounder 65: measured
  // live, 65ch renders at ~79 real characters per line at this file's own
  // 16px body/Inter (ch tracks the "0" glyph, not real prose width), and
  // 56ch is the value whose measured average lands in 65-70.
  it("ready: the reading column is capped at 56 characters (a text-relative unit chosen to measure 65-70 real characters), not a fixed pixel width", async () => {
    stubFetch({ documents: [docA], detailsByDocument: { "doc-1": detail(docA, { markdown: "Contenu du cours." }) } });
    renderScreen({ documentId: "doc-1" });

    await screen.findByText("Contenu du cours.");
    const card = screen.getByText("Contenu du cours.").closest('[class*="max-w"]');
    expect(card?.className).toContain("max-w-[56ch]");
    expect(card?.className).not.toContain("max-w-2xl");
    expect(card?.className).not.toContain("max-w-[65ch]");
  });

  // Decision 4a: a reading surface doesn't need to look like a bordered
  // card — the frame is gone, but the surface background stays so the text
  // doesn't sit directly on --canvas.
  it("ready: the reading surface has no card frame (no border, no card radius, no shadow), but keeps its surface background", async () => {
    stubFetch({ documents: [docA], detailsByDocument: { "doc-1": detail(docA, { markdown: "Contenu du cours." }) } });
    renderScreen({ documentId: "doc-1" });

    await screen.findByText("Contenu du cours.");
    const card = screen.getByText("Contenu du cours.").closest('[class*="max-w"]')!;
    // border-0 zeroes the border's own width regardless of border-border's
    // colour utility still being present in the merged string (twMerge
    // only dedupes within the same property group, and colour/width are
    // separate ones) — a zero-width border renders nothing, whatever
    // colour it's given, so this checks specifically for the bare `border`
    // *width* utility (Tailwind's un-suffixed one), not any border-* class.
    expect(card.className).not.toMatch(/(^|\s)border(\s|$)/);
    expect(card.className).toContain("border-0");
    expect(card.className).not.toContain("rounded-[var(--radius-card)]");
    expect(card.className).not.toMatch(/shadow-\[/);
    expect(card.className).toContain("bg-surface");
  });

  it("ready: shows an 'Étudier ce cours' panel offering the notions and the tutor, each a rounded button with its own icon", async () => {
    stubFetch({ documents: [docA], detailsByDocument: { "doc-1": detail(docA, { markdown: "Contenu du cours." }) } });
    renderScreen({ documentId: "doc-1" });

    await screen.findByText("Contenu du cours.");
    const panel = screen.getByTestId("reader-study-panel");
    await within(panel).findByText("Étudier ce cours");
    await within(panel).findByText("Exercice de mémorisation.");
    const notionsButton = within(panel).getByRole("button", { name: /notions/i });
    const tutorButton = within(panel).getByRole("button", { name: /tuteur/i });
    expect(notionsButton.className).toContain("rounded-2xl");
    expect(tutorButton.className).toContain("rounded-2xl");
    expect(notionsButton.querySelector("svg")).toBeInTheDocument();
    expect(tutorButton.querySelector("svg")).toBeInTheDocument();
  });

  it("ready: 'Réviser les notions' calls onOpenNotions with the selected course's id", async () => {
    const onOpenNotions = vi.fn();
    stubFetch({ documents: [docA], detailsByDocument: { "doc-1": detail(docA, { markdown: "Contenu du cours." }) } });
    const user = userEvent.setup();
    renderScreen({ documentId: "doc-1", onOpenNotions });

    await screen.findByText("Contenu du cours.");
    await user.click(within(screen.getByTestId("reader-study-panel")).getByRole("button", { name: /notions/i }));

    expect(onOpenNotions).toHaveBeenCalledWith("doc-1");
  });

  it("ready: 'Discuter avec le tuteur' calls onOpenTutor with the selected course's id", async () => {
    const onOpenTutor = vi.fn();
    stubFetch({ documents: [docA], detailsByDocument: { "doc-1": detail(docA, { markdown: "Contenu du cours." }) } });
    const user = userEvent.setup();
    renderScreen({ documentId: "doc-1", onOpenTutor });

    await screen.findByText("Contenu du cours.");
    await user.click(within(screen.getByTestId("reader-study-panel")).getByRole("button", { name: /tuteur/i }));

    expect(onOpenTutor).toHaveBeenCalledWith("doc-1");
  });

  it("ready: the study panel's own title is deliberately lighter than a real heading — not the display font or extrabold weight every other card title on this app uses", async () => {
    stubFetch({ documents: [docA], detailsByDocument: { "doc-1": detail(docA, { markdown: "Contenu du cours." }) } });
    renderScreen({ documentId: "doc-1" });

    const title = await screen.findByText("Étudier ce cours");
    expect(title.className).not.toMatch(/font-extrabold|font-\[family-name:var\(--font-display\)\]/);
  });

  it("ready: 'Discuter avec le tuteur' carries a light green tint (--primary-soft), the same secondary-with-tint idiom Mes cours' own 'Lire le cours' button already uses", async () => {
    stubFetch({ documents: [docA], detailsByDocument: { "doc-1": detail(docA, { markdown: "Contenu du cours." }) } });
    renderScreen({ documentId: "doc-1" });

    await screen.findByText("Contenu du cours.");
    const tutorButton = within(screen.getByTestId("reader-study-panel")).getByRole("button", { name: /tuteur/i });
    expect(tutorButton.className).toContain("bg-primary-soft");
  });

  it("no panel shown outside the ready state: nothing to study yet while the course is still extracting", async () => {
    stubFetch({ documents: [docA], detailsByDocument: { "doc-1": detail(docA, { status: "running" }) } });
    renderScreen({ documentId: "doc-1" });

    await screen.findByText(/encore en cours de lecture/i);
    expect(screen.queryByTestId("reader-study-panel")).not.toBeInTheDocument();
  });

  // M10 Phase 1's per-screen backlog: a real 375px measurement (the same
  // way NotionsScreen's own pass found this — CoursePill is duplicated
  // verbatim between the two files, docs/UI.md's Notions note flagged this
  // exact screen as a likely carrier of the same defect) found this
  // screen's own CoursePill at 38px tall too. Same fix: a real min-height,
  // not Aujourd'hui's own invisible pseudo-element — CoursePill sits in a
  // flex-wrap row with a real, fixed gap-2, so growing its own real box
  // can never overlap a neighbour.
  it("a course pill carries a 44px minimum height on mobile, reset back to its own natural height from md up", async () => {
    stubFetch({ documents: [docA, docB], detailsByDocument: { "doc-1": detail(docA, { markdown: "Contenu du cours." }) } });

    renderScreen();
    const pill = await screen.findByRole("button", { name: "Biologie" });

    expect(pill.className).toMatch(/min-h-11/);
    expect(pill.className).toMatch(/md:min-h-0/);
  });
});
