// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageCircle } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CoursePickerScreen } from "./CoursePickerScreen.js";

const aDocument = { id: "doc-1", title: "La photosynthèse", sourceType: "photo", status: "done", pageCount: 1, colour: "#F87171", createdAt: "2026-01-01T00:00:00Z" };

function renderPicker(onSelectDocument: (documentId: string) => void = () => undefined) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CoursePickerScreen
        heading="Notions"
        description="Choisis un cours pour voir ses notions."
        emptyMessage="Ajoute un cours dans Mes cours pour voir ses notions."
        ctaLabel="Voir les notions"
        ctaIcon={MessageCircle}
        onSelectDocument={onSelectDocument}
      />
    </QueryClientProvider>,
  );
}

function stubFetch(response: unknown[] | (() => Response)) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() => {
      if (typeof response === "function") return Promise.resolve(response());
      return Promise.resolve(new Response(JSON.stringify(response), { status: 200 }));
    }),
  );
}

// docs/UI.md's Navigation note: "Notions' and Lecteur's own pickers are the
// identical component" as Tuteur's — this is that shared component, generic
// over heading/description/copy/CTA so each nav destination's own picker
// reuses one implementation, not three near-identical ones.
describe("CoursePickerScreen", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loading state: shows a skeleton under the given heading, never a bare spinner", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    renderPicker();
    expect(screen.getByRole("heading", { name: "Notions" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("error state: the confused mascot, an explicit message, and a retry", async () => {
    stubFetch(() => new Response(null, { status: 500 }));
    renderPicker();
    await screen.findByText(/impossible de charger tes cours/i);
    expect(screen.getByTestId("mascot")).toBeInTheDocument();
  });

  it("empty state: shows the given empty message, never 'aucun résultat'", async () => {
    stubFetch([]);
    renderPicker();
    await screen.findByText("Ajoute un cours dans Mes cours pour voir ses notions.");
    expect(screen.queryByText(/aucun résultat/i)).not.toBeInTheDocument();
  });

  it("ready state: shows the given description, lists documents, and picking one calls back with its id", async () => {
    stubFetch([aDocument]);
    const onSelectDocument = vi.fn();
    const user = userEvent.setup();
    renderPicker(onSelectDocument);

    await screen.findByText("Choisis un cours pour voir ses notions.");
    await screen.findByText("La photosynthèse");
    await user.click(screen.getByRole("button", { name: "Voir les notions" }));

    expect(onSelectDocument).toHaveBeenCalledWith("doc-1");
  });
});
