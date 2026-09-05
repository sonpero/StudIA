// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TutorScreen } from "./TutorScreen.js";
import { getCachedConversationId } from "../lib/tutor-storage.js";

function renderScreen(props: Partial<{ documentId: string; onSelectDocument: (id: string) => void; onBack: () => void }> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <TutorScreen documentId={props.documentId} onSelectDocument={props.onSelectDocument ?? (() => undefined)} onBack={props.onBack ?? (() => undefined)} />
    </QueryClientProvider>,
  );
}

const aDocument = {
  id: "doc-1",
  title: "La photosynthèse",
  sourceType: "photo",
  status: "done",
  pageCount: 2,
  colour: "#F87171",
  createdAt: "2026-01-01T00:00:00Z",
  lastError: null,
  markdown: "# La photosynthèse\n\nUn cours sur la photosynthèse.",
};

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

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string, init?: RequestInit) => Promise.resolve(handler(url, init))),
  );
}

describe("TutorScreen — picker (no course chosen)", () => {
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
    stubFetch(() => new Response(null, { status: 500 }));
    renderScreen();
    await screen.findByText(/impossible de charger tes cours/i);
    expect(screen.getByTestId("mascot")).toBeInTheDocument();
  });

  it("empty state: invites the user to add a course first, never 'aucun résultat'", async () => {
    stubFetch(() => new Response(JSON.stringify([]), { status: 200 }));
    renderScreen();
    await screen.findByText(/ajoute un cours/i);
    expect(screen.queryByText(/aucun résultat/i)).not.toBeInTheDocument();
  });

  it("ready state: lists documents and picking one calls back with its id", async () => {
    stubFetch(() => new Response(JSON.stringify([aDocument]), { status: 200 }));
    const onSelectDocument = vi.fn();
    const user = userEvent.setup();
    renderScreen({ onSelectDocument });

    await screen.findByText("La photosynthèse");
    await user.click(screen.getByRole("button", { name: /discuter/i }));

    expect(onSelectDocument).toHaveBeenCalledWith("doc-1");
  });
});

describe("TutorScreen — document readiness (reuses Lecteur's own states)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("still extracting: the reading mascot and a wait message, no composer", async () => {
    stubFetch(() => new Response(JSON.stringify({ ...aDocument, status: "running" }), { status: 200 }));
    renderScreen({ documentId: "doc-1" });

    await screen.findByText(/encore en cours de lecture/i);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("failed: the confused mascot and a message pointing to Mes cours, no duplicate retry", async () => {
    stubFetch(() => new Response(JSON.stringify({ ...aDocument, status: "failed" }), { status: 200 }));
    renderScreen({ documentId: "doc-1" });

    await screen.findByText(/la lecture de ce cours a échoué/i);
    expect(screen.queryByRole("button", { name: /réessayer/i })).not.toBeInTheDocument();
  });

  it("done but blank: idle mascot, nothing readable message", async () => {
    stubFetch(() => new Response(JSON.stringify({ ...aDocument, markdown: "   " }), { status: 200 }));
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

  it("no cached conversation: opens straight on the empty state, no extra fetch", async () => {
    stubFetch((url) => {
      if (url.includes("/api/documents/doc-1")) return new Response(JSON.stringify(aDocument), { status: 200 });
      throw new Error(`unexpected fetch: ${url}`);
    });
    renderScreen({ documentId: "doc-1" });

    await screen.findByText(/pose ta première question/i);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("a cached conversation: loading then its history, ready state", async () => {
    localStorage.setItem("studia:tutor:conversation:doc-1", "c1");
    stubFetch((url) => {
      if (url.includes("/api/documents/doc-1")) return new Response(JSON.stringify(aDocument), { status: 200 });
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
      throw new Error(`unexpected fetch: ${url}`);
    });
    renderScreen({ documentId: "doc-1" });

    await screen.findByText("Une question ?");
    expect(screen.getByText("Une réponse.")).toBeInTheDocument();
    expect(screen.queryByText("Un passage cité.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Voir les sources (1)" })).toBeInTheDocument();
  });

  it("a cached conversation that fails to load: confused mascot and retry", async () => {
    localStorage.setItem("studia:tutor:conversation:doc-1", "c1");
    stubFetch((url) => {
      if (url.includes("/api/documents/doc-1")) return new Response(JSON.stringify(aDocument), { status: 200 });
      if (url.includes("/api/conversations/c1")) return new Response(null, { status: 500 });
      throw new Error(`unexpected fetch: ${url}`);
    });
    renderScreen({ documentId: "doc-1" });

    await screen.findByText(/impossible de charger cette conversation/i);
  });

  it("sending the first question creates a conversation, streams the answer, and caches the conversation id", async () => {
    const user = userEvent.setup();
    stubFetch((url, init) => {
      // More specific URLs first: "/api/documents/doc-1/conversations" is a
      // prefix match for the plain readiness check below, so it has to be
      // tested before the shorter, more general one.
      if (url.endsWith("/api/documents/doc-1/conversations") && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "c1", userId: "u1", documentId: "doc-1", title: null, createdAt: "2026-01-01T00:00:00Z" }), { status: 201 });
      }
      if (url.includes("/api/conversations/c1/messages")) {
        return sseResponse('event: chunk\ndata: {"text":"La "}\n\nevent: chunk\ndata: {"text":"photosynthèse."}\n\nevent: done\ndata: {"citations":[{"text":"Un passage cité."}],"grounded":true}\n\n');
      }
      if (url.includes("/api/documents/doc-1")) return new Response(JSON.stringify(aDocument), { status: 200 });
      throw new Error(`unexpected fetch: ${url}`);
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
    stubFetch((url) => {
      if (url.includes("/api/documents/doc-1")) return new Response(JSON.stringify(aDocument), { status: 200 });
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
      throw new Error(`unexpected fetch: ${url}`);
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
    stubFetch((url) => {
      if (url.includes("/api/documents/doc-1")) return new Response(JSON.stringify(aDocument), { status: 200 });
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
      throw new Error(`unexpected fetch: ${url}`);
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
    stubFetch((url) => {
      if (url.includes("/api/documents/doc-1")) return new Response(JSON.stringify(aDocument), { status: 200 });
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
      throw new Error(`unexpected fetch: ${url}`);
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
    stubFetch((url) => {
      if (url.includes("/api/documents/doc-1")) return new Response(JSON.stringify(aDocument), { status: 200 });
      if (url.includes("/api/conversations/c1/messages")) {
        return sseResponse('event: chunk\ndata: {"text":"Ce cours n\'aborde pas ce sujet."}\n\nevent: done\ndata: {"citations":[],"grounded":false}\n\n');
      }
      if (url.includes("/api/conversations/c1")) {
        return new Response(JSON.stringify({ conversation: { id: "c1", userId: "u1", documentId: "doc-1", title: null, createdAt: "2026-01-01T00:00:00Z" }, messages: [] }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
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
    stubFetch((url) => {
      if (url.includes("/api/documents/doc-1")) return new Response(JSON.stringify(aDocument), { status: 200 });
      if (url.includes("/api/conversations/c1/messages")) {
        return sseResponse('event: chunk\ndata: {"text":"Voici le début de la réponse"}\n\nevent: partial\ndata: {}\n\n');
      }
      if (url.includes("/api/conversations/c1")) {
        return new Response(JSON.stringify({ conversation: { id: "c1", userId: "u1", documentId: "doc-1", title: null, createdAt: "2026-01-01T00:00:00Z" }, messages: [] }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
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
    stubFetch((url) => {
      if (url.includes("/api/documents/doc-1")) return new Response(JSON.stringify(aDocument), { status: 200 });
      if (url.includes("/api/conversations/c1/messages")) {
        return sseEvents([
          { event: "chunk", data: { text: "# Titre\n\nCeci est **important**." } },
          { event: "done", data: { citations: [], grounded: false } },
        ]);
      }
      if (url.includes("/api/conversations/c1")) {
        return new Response(JSON.stringify({ conversation: { id: "c1", userId: "u1", documentId: "doc-1", title: null, createdAt: "2026-01-01T00:00:00Z" }, messages: [] }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
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
    stubFetch((url) => {
      if (url.includes("/api/documents/doc-1")) return new Response(JSON.stringify(aDocument), { status: 200 });
      if (url.includes("/api/conversations/c1/messages")) {
        return sseEvents([
          { event: "chunk", data: { text: "Regarde [ce site](https://evil.example.com/phish) pour en savoir plus." } },
          { event: "done", data: { citations: [], grounded: false } },
        ]);
      }
      if (url.includes("/api/conversations/c1")) {
        return new Response(JSON.stringify({ conversation: { id: "c1", userId: "u1", documentId: "doc-1", title: null, createdAt: "2026-01-01T00:00:00Z" }, messages: [] }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
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
    stubFetch((url) => {
      if (url.includes("/api/documents/doc-1")) return new Response(JSON.stringify(aDocument), { status: 200 });
      if (url.includes("/api/conversations/c1/messages")) {
        return sseEvents([
          { event: "chunk", data: { text: "![Texte alternatif](https://evil.example.com/pixel.png)" } },
          { event: "done", data: { citations: [], grounded: false } },
        ]);
      }
      if (url.includes("/api/conversations/c1")) {
        return new Response(JSON.stringify({ conversation: { id: "c1", userId: "u1", documentId: "doc-1", title: null, createdAt: "2026-01-01T00:00:00Z" }, messages: [] }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
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
    stubFetch((url) => {
      if (url.includes("/api/documents/doc-1")) return new Response(JSON.stringify(aDocument), { status: 200 });
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
      throw new Error(`unexpected fetch: ${url}`);
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
