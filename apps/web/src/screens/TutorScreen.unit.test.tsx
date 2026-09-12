// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { DocumentDetailResponse, DocumentSummary } from "@studia/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TutorScreen } from "./TutorScreen.js";
import { getCachedConversationId } from "../lib/tutor-storage.js";
import type { Notion } from "../lib/notions-api.js";

// Redesigned per a "Tuteur" mockup, ignoring docs/UI.md per the user, the
// same unification Notions/Lecteur already went through: one page — a pill
// selector of courses at the top, then that course's own chat — replacing
// the old two-step CoursePickerScreen → TutorChatScreen flow (deleted along
// with this rewrite, since Tuteur was its only remaining runtime consumer).
// Deep links from elsewhere (documentId set, NotionsScreen's own "Discuter
// du cours") still pre-select that course and show "Retour"; the nav's own
// direct entry (documentId undefined) shows no back link and defaults to
// the first course.
function renderScreen(overrides: Partial<{ documentId: string; onBack: () => void }> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <TutorScreen documentId={overrides.documentId} onBack={overrides.onBack ?? (() => undefined)} />
    </QueryClientProvider>,
  );
}

const docA: DocumentSummary = { id: "doc-1", title: "La photosynthèse", sourceType: "photo", status: "done", pageCount: 2, colour: "#F87171", createdAt: "2026-01-01T00:00:00Z" };
const docB: DocumentSummary = { id: "doc-2", title: "L'algèbre", sourceType: "photo", status: "done", pageCount: 1, colour: "#38BDF8", createdAt: "2026-01-01T00:00:00Z" };

function detail(doc: DocumentSummary, extra: Partial<DocumentDetailResponse> = {}): DocumentDetailResponse {
  return { ...doc, lastError: null, markdown: "# Cours\n\nContenu.", ...extra };
}

function sseResponse(body: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

// Builds a valid SSE body from real objects via JSON.stringify, rather than
// hand-typing escaped JSON in a template literal -- safer once the payload
// text itself contains markdown syntax (newlines, brackets, asterisks).
function sseEvents(events: { event: string; data: unknown }[]): Response {
  return sseResponse(events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join(""));
}

// Same "custom handler tried first, then documents-list/detail/notions
// defaults" shape as ReaderScreen.unit.test.tsx's own stubFetch — the
// conversation/messages endpoints vary too much per test to give them a
// shared default, so `custom` handles those; everything else (the course
// list feeding the pill row, a course's own detail, its notions feeding the
// suggested-chip row) falls back to plain per-test fixtures.
function stubFetch(options: {
  documents?: DocumentSummary[] | (() => Response);
  detailsByDocument?: Record<string, DocumentDetailResponse | (() => Response)>;
  notionsByDocument?: Record<string, Notion[]>;
  custom?: (url: string, init?: RequestInit) => Response | Promise<Response> | undefined;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const customResult = await options.custom?.(url, init);
      if (customResult) return customResult;

      const detailMatch = /\/api\/documents\/([^/]+)$/.exec(url);
      if (detailMatch) {
        const entry = options.detailsByDocument?.[detailMatch[1]!];
        if (typeof entry === "function") return entry();
        if (entry) return new Response(JSON.stringify(entry), { status: 200 });
        return new Response(null, { status: 404 });
      }

      const notionsMatch = /\/api\/documents\/([^/]+)\/notions$/.exec(url);
      if (notionsMatch) {
        return new Response(JSON.stringify(options.notionsByDocument?.[notionsMatch[1]!] ?? []), { status: 200 });
      }

      if (/\/api\/documents$/.test(url)) {
        if (typeof options.documents === "function") return options.documents();
        return new Response(JSON.stringify(options.documents ?? []), { status: 200 });
      }

      return new Response(JSON.stringify([]), { status: 200 });
    }),
  );
}

describe("TutorScreen — course picker (pill selector, no separate picker page)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("loading state: shows a skeleton, never a bare spinner", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    renderScreen();
    expect(screen.getByRole("heading", { name: "Tuteur" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("error state: the confused mascot, an explicit message, and a retry", async () => {
    stubFetch({ documents: () => new Response(null, { status: 500 }) });
    renderScreen();
    await screen.findByText(/impossible de charger tes cours/i);
    expect(screen.getByTestId("mascot")).toBeInTheDocument();
  });

  it("empty state: invites the user to add a course first, never 'aucun résultat'", async () => {
    stubFetch({ documents: [] });
    renderScreen();
    await screen.findByText(/ajoute un cours/i);
    expect(screen.queryByText(/aucun résultat/i)).not.toBeInTheDocument();
  });

  it("directly from the nav (no documentId): the first course is selected automatically, its pill is active, and there is no back link", async () => {
    stubFetch({ documents: [docA, docB], detailsByDocument: { "doc-1": detail(docA) } });
    renderScreen();

    expect(await screen.findByRole("button", { name: "La photosynthèse" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "L'algèbre" })).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("button", { name: "Retour" })).not.toBeInTheDocument();
  });

  it("a documentId prop pre-selects that course's pill and shows 'Retour'", async () => {
    stubFetch({ documents: [docA, docB], detailsByDocument: { "doc-2": detail(docB) } });
    renderScreen({ documentId: "doc-2" });

    expect(await screen.findByRole("button", { name: "L'algèbre" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Retour" })).toBeInTheDocument();
  });

  it("clicking a different pill switches the course shown, key-remounting its own conversation state", async () => {
    stubFetch({
      documents: [docA, docB],
      detailsByDocument: { "doc-1": detail(docA), "doc-2": detail(docB) },
    });
    const user = userEvent.setup();
    renderScreen();

    await screen.findByTestId("tutor-greeting");
    expect(screen.getByTestId("tutor-greeting")).toHaveTextContent("La photosynthèse");
    await user.click(screen.getByRole("button", { name: "L'algèbre" }));

    await screen.findByTestId("tutor-greeting");
    expect(screen.getByTestId("tutor-greeting")).toHaveTextContent("L'algèbre");
    expect(screen.getByRole("button", { name: "L'algèbre" })).toHaveAttribute("aria-current", "page");
  });

  it("'Retour' calls onBack", async () => {
    const onBack = vi.fn();
    stubFetch({ documents: [docA], detailsByDocument: { "doc-1": detail(docA) } });
    const user = userEvent.setup();
    renderScreen({ documentId: "doc-1", onBack });

    await screen.findByRole("button", { name: "Retour" });
    await user.click(screen.getByRole("button", { name: "Retour" }));

    expect(onBack).toHaveBeenCalled();
  });
});

describe("TutorScreen — document readiness (reuses Lecteur's own states)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("still extracting: the reading mascot and a wait message, no composer", async () => {
    stubFetch({ documents: [docA], detailsByDocument: { "doc-1": detail(docA, { status: "running" }) } });
    renderScreen({ documentId: "doc-1" });

    await screen.findByText(/encore en cours de lecture/i);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("failed: the confused mascot and a message pointing to Mes cours, no duplicate retry", async () => {
    stubFetch({ documents: [docA], detailsByDocument: { "doc-1": detail(docA, { status: "failed" }) } });
    renderScreen({ documentId: "doc-1" });

    await screen.findByText(/la lecture de ce cours a échoué/i);
    expect(screen.queryByRole("button", { name: /réessayer/i })).not.toBeInTheDocument();
  });

  it("done but blank: idle mascot, nothing readable message", async () => {
    stubFetch({ documents: [docA], detailsByDocument: { "doc-1": detail(docA, { markdown: "   " }) } });
    renderScreen({ documentId: "doc-1" });

    await screen.findByText(/ne contient pas encore de texte lisible/i);
  });
});

describe("TutorScreen — conversation, document ready", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("no cached conversation: opens on a greeting bubble naming the course, no extra fetch, composer ready", async () => {
    stubFetch({ documents: [docA], detailsByDocument: { "doc-1": detail(docA) } });
    renderScreen({ documentId: "doc-1" });

    await screen.findByTestId("tutor-greeting");
    expect(screen.getByTestId("tutor-greeting")).toHaveTextContent("La photosynthèse");
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("suggested chips: pulled from the course's own real notions, clicking one prefills the composer without sending", async () => {
    const notions: Notion[] = [
      { id: "n1", documentId: "doc-1", userId: "u1", title: "La chlorophylle", body: "Corps.", difficulty: "medium", position: 0, createdAt: "2026-01-01T00:00:00Z" },
      { id: "n2", documentId: "doc-1", userId: "u1", title: "La respiration", body: "Corps.", difficulty: "medium", position: 1, createdAt: "2026-01-01T00:00:00Z" },
    ];
    stubFetch({ documents: [docA], detailsByDocument: { "doc-1": detail(docA) }, notionsByDocument: { "doc-1": notions } });
    const user = userEvent.setup();
    renderScreen({ documentId: "doc-1" });

    const chip = await screen.findByRole("button", { name: /la chlorophylle/i });
    await user.click(chip);

    expect(screen.getByRole("textbox")).toHaveValue(chip.textContent);
    // Prefill only, never an auto-send (docs/UI.md's own "the app proposes,
    // the person decides"): nothing was sent, so no conversation exists yet.
    expect(getCachedConversationId("doc-1")).toBeNull();
  });

  it("suggested chips: absent when the course has no notions yet, no crash", async () => {
    stubFetch({ documents: [docA], detailsByDocument: { "doc-1": detail(docA) }, notionsByDocument: { "doc-1": [] } });
    renderScreen({ documentId: "doc-1" });

    await screen.findByTestId("tutor-greeting");
    expect(screen.queryByTestId("tutor-suggested-chips")).not.toBeInTheDocument();
  });

  it("a cached conversation: loading then its history, ready state, no greeting bubble", async () => {
    localStorage.setItem("studia:tutor:conversation:doc-1", "c1");
    stubFetch({
      documents: [docA],
      detailsByDocument: { "doc-1": detail(docA) },
      custom: (url) => {
        if (url.includes("/api/conversations/c1")) {
          return new Response(
            JSON.stringify({
              conversation: { id: "c1", userId: "u1", documentId: "doc-1", title: "Une question ?", createdAt: "2026-01-01T00:00:00Z" },
              messages: [
                { id: "m1", conversationId: "c1", role: "user", content: "Une question ?", citations: null, partial: false, createdAt: "2026-01-01T00:00:00Z" },
                { id: "m2", conversationId: "c1", role: "assistant", content: "Une réponse.", citations: [{ text: "Un passage cité." }], partial: false, createdAt: "2026-01-01T00:00:01Z" },
              ],
            }),
            { status: 200 },
          );
        }
        return undefined;
      },
    });
    renderScreen({ documentId: "doc-1" });

    await screen.findByText("Une question ?");
    expect(screen.getByText("Une réponse.")).toBeInTheDocument();
    expect(screen.queryByText("Un passage cité.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Voir les sources (1)" })).toBeInTheDocument();
    expect(screen.queryByTestId("tutor-greeting")).not.toBeInTheDocument();
  });

  it("a cached conversation that fails to load: confused mascot and retry", async () => {
    localStorage.setItem("studia:tutor:conversation:doc-1", "c1");
    stubFetch({
      documents: [docA],
      detailsByDocument: { "doc-1": detail(docA) },
      custom: (url) => {
        if (url.includes("/api/conversations/c1")) return new Response(null, { status: 500 });
        return undefined;
      },
    });
    renderScreen({ documentId: "doc-1" });

    await screen.findByText(/impossible de charger cette conversation/i);
  });

  it("sending the first question creates a conversation, streams the answer, and caches the conversation id", async () => {
    const user = userEvent.setup();
    stubFetch({
      documents: [docA],
      detailsByDocument: { "doc-1": detail(docA) },
      custom: (url, init) => {
        // More specific URLs first: "/api/documents/doc-1/conversations" is a
        // prefix match for the plain detail check above, so it has to be
        // tested before falling through to it.
        if (url.endsWith("/api/documents/doc-1/conversations") && init?.method === "POST") {
          return new Response(JSON.stringify({ id: "c1", userId: "u1", documentId: "doc-1", title: null, createdAt: "2026-01-01T00:00:00Z" }), { status: 201 });
        }
        if (url.includes("/api/conversations/c1/messages")) {
          return sseResponse('event: chunk\ndata: {"text":"La "}\n\nevent: chunk\ndata: {"text":"photosynthèse."}\n\nevent: done\ndata: {"citations":[{"text":"Un passage cité."}],"grounded":true}\n\n');
        }
        return undefined;
      },
    });
    renderScreen({ documentId: "doc-1" });

    await screen.findByRole("textbox");
    await user.type(screen.getByRole("textbox"), "Qu'est-ce que la photosynthèse ?");
    await user.click(screen.getByRole("button", { name: /envoyer/i }));

    await screen.findByText("Qu'est-ce que la photosynthèse ?");
    await screen.findByText("La photosynthèse.");
    expect(screen.queryByText("Un passage cité.")).not.toBeInTheDocument();
    expect(getCachedConversationId("doc-1")).toBe("c1");
  });

  it("citations are collapsed by default, with a count in the trigger; expanding and collapsing again toggles them and aria-expanded", async () => {
    localStorage.setItem("studia:tutor:conversation:doc-1", "c1");
    stubFetch({
      documents: [docA],
      detailsByDocument: { "doc-1": detail(docA) },
      custom: (url) => {
        if (url.includes("/api/conversations/c1")) {
          return new Response(
            JSON.stringify({
              conversation: { id: "c1", userId: "u1", documentId: "doc-1", title: "Une question ?", createdAt: "2026-01-01T00:00:00Z" },
              messages: [
                { id: "m1", conversationId: "c1", role: "user", content: "Une question ?", citations: null, partial: false, createdAt: "2026-01-01T00:00:00Z" },
                {
                  id: "m2",
                  conversationId: "c1",
                  role: "assistant",
                  content: "Une réponse.",
                  citations: [{ text: "Premier passage." }, { text: "Second passage." }],
                  partial: false,
                  createdAt: "2026-01-01T00:00:01Z",
                },
              ],
            }),
            { status: 200 },
          );
        }
        return undefined;
      },
    });
    const user = userEvent.setup();
    renderScreen({ documentId: "doc-1" });

    await screen.findByText("Une réponse.");
    const trigger = screen.getByRole("button", { name: "Voir les sources (2)" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Premier passage.")).not.toBeInTheDocument();
    expect(screen.queryByText("Second passage.")).not.toBeInTheDocument();

    await user.click(trigger);

    const collapseTrigger = screen.getByRole("button", { name: "Masquer les sources" });
    expect(collapseTrigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Premier passage.")).toBeInTheDocument();
    expect(screen.getByText("Second passage.")).toBeInTheDocument();

    await user.click(collapseTrigger);

    expect(screen.getByRole("button", { name: "Voir les sources (2)" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Premier passage.")).not.toBeInTheDocument();
  });

  it("each message's citations expand independently: expanding one leaves the other collapsed", async () => {
    localStorage.setItem("studia:tutor:conversation:doc-1", "c1");
    stubFetch({
      documents: [docA],
      detailsByDocument: { "doc-1": detail(docA) },
      custom: (url) => {
        if (url.includes("/api/conversations/c1")) {
          return new Response(
            JSON.stringify({
              conversation: { id: "c1", userId: "u1", documentId: "doc-1", title: "Q1", createdAt: "2026-01-01T00:00:00Z" },
              messages: [
                { id: "m1", conversationId: "c1", role: "user", content: "Première question ?", citations: null, partial: false, createdAt: "2026-01-01T00:00:00Z" },
                { id: "m2", conversationId: "c1", role: "assistant", content: "Première réponse.", citations: [{ text: "Source A." }], partial: false, createdAt: "2026-01-01T00:00:01Z" },
                { id: "m3", conversationId: "c1", role: "user", content: "Seconde question ?", citations: null, partial: false, createdAt: "2026-01-01T00:00:02Z" },
                { id: "m4", conversationId: "c1", role: "assistant", content: "Seconde réponse.", citations: [{ text: "Source B." }], partial: false, createdAt: "2026-01-01T00:00:03Z" },
              ],
            }),
            { status: 200 },
          );
        }
        return undefined;
      },
    });
    const user = userEvent.setup();
    renderScreen({ documentId: "doc-1" });

    await screen.findByText("Première réponse.");
    const triggers = screen.getAllByRole("button", { name: "Voir les sources (1)" });
    expect(triggers).toHaveLength(2);

    await user.click(triggers[0]!);

    expect(screen.getByText("Source A.")).toBeInTheDocument();
    expect(screen.queryByText("Source B.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Voir les sources (1)" })).toBeInTheDocument();
  });

  it("the thinking mascot shows while streaming and is gone once the answer is complete", async () => {
    const user = userEvent.setup();
    localStorage.setItem("studia:tutor:conversation:doc-1", "c1");
    let resolveChunk!: () => void;
    const chunkGate = new Promise<void>((resolve) => {
      resolveChunk = resolve;
    });
    stubFetch({
      documents: [docA],
      detailsByDocument: { "doc-1": detail(docA) },
      custom: (url) => {
        if (url.includes("/api/conversations/c1/messages")) {
          const encoder = new TextEncoder();
          const stream = new ReadableStream<Uint8Array>({
            async start(controller) {
              await chunkGate;
              controller.enqueue(encoder.encode('event: chunk\ndata: {"text":"Réponse."}\n\nevent: done\ndata: {"citations":[],"grounded":false}\n\n'));
              controller.close();
            },
          });
          return new Response(stream, { status: 200 });
        }
        if (url.includes("/api/conversations/c1")) {
          return new Response(JSON.stringify({ conversation: { id: "c1", userId: "u1", documentId: "doc-1", title: null, createdAt: "2026-01-01T00:00:00Z" }, messages: [] }), { status: 200 });
        }
        return undefined;
      },
    });
    renderScreen({ documentId: "doc-1" });

    await screen.findByRole("textbox");
    await user.type(screen.getByRole("textbox"), "Une question ?");
    await user.click(screen.getByRole("button", { name: /envoyer/i }));

    await screen.findByTestId("mascot");
    resolveChunk();
    await screen.findByText("Réponse.");
    expect(screen.queryByTestId("mascot")).not.toBeInTheDocument();
  });

  it("a refusal (grounded:false) shows no citations and no distinct styling from a normal answer", async () => {
    const user = userEvent.setup();
    localStorage.setItem("studia:tutor:conversation:doc-1", "c1");
    stubFetch({
      documents: [docA],
      detailsByDocument: { "doc-1": detail(docA) },
      custom: (url) => {
        if (url.includes("/api/conversations/c1/messages")) {
          return sseResponse('event: chunk\ndata: {"text":"Ce cours n\'aborde pas ce sujet."}\n\nevent: done\ndata: {"citations":[],"grounded":false}\n\n');
        }
        if (url.includes("/api/conversations/c1")) {
          return new Response(JSON.stringify({ conversation: { id: "c1", userId: "u1", documentId: "doc-1", title: null, createdAt: "2026-01-01T00:00:00Z" }, messages: [] }), { status: 200 });
        }
        return undefined;
      },
    });
    renderScreen({ documentId: "doc-1" });

    await screen.findByRole("textbox");
    await user.type(screen.getByRole("textbox"), "Une question hors sujet ?");
    await user.click(screen.getByRole("button", { name: /envoyer/i }));

    await screen.findByText("Ce cours n'aborde pas ce sujet.");
    expect(screen.queryByText(/la réponse s'est arrêtée/i)).not.toBeInTheDocument();
  });

  it("a partial answer keeps the streamed text, shows a plain interruption notice, and pre-fills the composer for a resend", async () => {
    const user = userEvent.setup();
    localStorage.setItem("studia:tutor:conversation:doc-1", "c1");
    stubFetch({
      documents: [docA],
      detailsByDocument: { "doc-1": detail(docA) },
      custom: (url) => {
        if (url.includes("/api/conversations/c1/messages")) {
          return sseResponse('event: chunk\ndata: {"text":"Voici le début de la réponse"}\n\nevent: partial\ndata: {}\n\n');
        }
        if (url.includes("/api/conversations/c1")) {
          return new Response(JSON.stringify({ conversation: { id: "c1", userId: "u1", documentId: "doc-1", title: null, createdAt: "2026-01-01T00:00:00Z" }, messages: [] }), { status: 200 });
        }
        return undefined;
      },
    });
    renderScreen({ documentId: "doc-1" });

    await screen.findByRole("textbox");
    await user.type(screen.getByRole("textbox"), "Une longue question ?");
    await user.click(screen.getByRole("button", { name: /envoyer/i }));

    await screen.findByText("Voici le début de la réponse");
    await screen.findByText(/la réponse s'est arrêtée avant la fin/i);
    expect(screen.getByRole("textbox")).toHaveValue("Une longue question ?");
  });

  it("renders the answer as markdown: bold text becomes a real <strong>, a heading is readable text, not literal '#' or '**'", async () => {
    const user = userEvent.setup();
    localStorage.setItem("studia:tutor:conversation:doc-1", "c1");
    stubFetch({
      documents: [docA],
      detailsByDocument: { "doc-1": detail(docA) },
      custom: (url) => {
        if (url.includes("/api/conversations/c1/messages")) {
          return sseEvents([
            { event: "chunk", data: { text: "# Titre\n\nCeci est **important**." } },
            { event: "done", data: { citations: [], grounded: false } },
          ]);
        }
        if (url.includes("/api/conversations/c1")) {
          return new Response(JSON.stringify({ conversation: { id: "c1", userId: "u1", documentId: "doc-1", title: null, createdAt: "2026-01-01T00:00:00Z" }, messages: [] }), { status: 200 });
        }
        return undefined;
      },
    });
    renderScreen({ documentId: "doc-1" });

    await screen.findByRole("textbox");
    await user.type(screen.getByRole("textbox"), "Une question ?");
    await user.click(screen.getByRole("button", { name: /envoyer/i }));

    const strong = await screen.findByText("important");
    expect(strong.tagName).toBe("STRONG");
    expect(screen.queryByText(/\*\*important\*\*/)).not.toBeInTheDocument();
    const titre = screen.getByText("Titre");
    expect(titre).toBeInTheDocument();
    // Not H1-H6: the screen's own "Tuteur" heading is a real <h1> too, so
    // this checks the specific element the markdown "# Titre" produced, not
    // the whole document.
    expect(/^H[1-6]$/.test(titre.tagName)).toBe(false);
    expect(screen.queryByText(/^#\s?Titre/)).not.toBeInTheDocument();
  });

  it("a markdown link in the answer never becomes a clickable <a>: only its own text is shown", async () => {
    const user = userEvent.setup();
    localStorage.setItem("studia:tutor:conversation:doc-1", "c1");
    stubFetch({
      documents: [docA],
      detailsByDocument: { "doc-1": detail(docA) },
      custom: (url) => {
        if (url.includes("/api/conversations/c1/messages")) {
          return sseEvents([
            { event: "chunk", data: { text: "Regarde [ce site](https://evil.example.com/phish) pour en savoir plus." } },
            { event: "done", data: { citations: [], grounded: false } },
          ]);
        }
        if (url.includes("/api/conversations/c1")) {
          return new Response(JSON.stringify({ conversation: { id: "c1", userId: "u1", documentId: "doc-1", title: null, createdAt: "2026-01-01T00:00:00Z" }, messages: [] }), { status: 200 });
        }
        return undefined;
      },
    });
    renderScreen({ documentId: "doc-1" });

    await screen.findByRole("textbox");
    await user.type(screen.getByRole("textbox"), "Une question ?");
    await user.click(screen.getByRole("button", { name: /envoyer/i }));

    await screen.findByText(/ce site/);
    // Both halves matter: real markdown parsing did strip the [text](url)
    // syntax (not just "nothing renders at all", which would also leave no
    // <a> but for the wrong reason), and no real link was produced from it.
    expect(screen.queryByText(/\[ce site\]/)).not.toBeInTheDocument();
    expect(document.querySelector("a")).not.toBeInTheDocument();
  });

  it("a markdown image in the answer never becomes an <img>: only its alt text is shown, no external URL can ever load", async () => {
    const user = userEvent.setup();
    localStorage.setItem("studia:tutor:conversation:doc-1", "c1");
    stubFetch({
      documents: [docA],
      detailsByDocument: { "doc-1": detail(docA) },
      custom: (url) => {
        if (url.includes("/api/conversations/c1/messages")) {
          return sseEvents([
            { event: "chunk", data: { text: "![Texte alternatif](https://evil.example.com/pixel.png)" } },
            { event: "done", data: { citations: [], grounded: false } },
          ]);
        }
        if (url.includes("/api/conversations/c1")) {
          return new Response(JSON.stringify({ conversation: { id: "c1", userId: "u1", documentId: "doc-1", title: null, createdAt: "2026-01-01T00:00:00Z" }, messages: [] }), { status: 200 });
        }
        return undefined;
      },
    });
    renderScreen({ documentId: "doc-1" });

    await screen.findByRole("textbox");
    await user.type(screen.getByRole("textbox"), "Une question ?");
    await user.click(screen.getByRole("button", { name: /envoyer/i }));

    await screen.findByText("Texte alternatif");
    expect(document.querySelector("img")).not.toBeInTheDocument();
  });

  it("a citation also renders as markdown, readable and not raw, with the same link/image neutralisation", async () => {
    localStorage.setItem("studia:tutor:conversation:doc-1", "c1");
    stubFetch({
      documents: [docA],
      detailsByDocument: { "doc-1": detail(docA) },
      custom: (url) => {
        if (url.includes("/api/conversations/c1")) {
          return new Response(
            JSON.stringify({
              conversation: { id: "c1", userId: "u1", documentId: "doc-1", title: "Q", createdAt: "2026-01-01T00:00:00Z" },
              messages: [
                {
                  id: "m1",
                  conversationId: "c1",
                  role: "assistant",
                  content: "Réponse.",
                  citations: [{ text: "# Titre\n\nVoir [la source](https://evil.example.com) et ![img](https://evil.example.com/x.png)." }],
                  partial: false,
                  createdAt: "2026-01-01T00:00:01Z",
                },
              ],
            }),
            { status: 200 },
          );
        }
        return undefined;
      },
    });
    const user = userEvent.setup();
    renderScreen({ documentId: "doc-1" });

    await screen.findByText("Réponse.");
    await user.click(screen.getByRole("button", { name: "Voir les sources (1)" }));

    const titre = screen.getByText("Titre");
    expect(titre).toBeInTheDocument();
    expect(/^H[1-6]$/.test(titre.tagName)).toBe(false);
    expect(screen.queryByText(/^#\s?Titre/)).not.toBeInTheDocument();
    expect(screen.getByText(/la source/)).toBeInTheDocument();
    expect(screen.getByText(/img/)).toBeInTheDocument();
    expect(document.querySelector("a")).not.toBeInTheDocument();
    expect(document.querySelector("img")).not.toBeInTheDocument();
  });
});
