// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UploadCard } from "./UploadCard.js";

function aFile(name: string) {
  return new File(["bytes"], name, { type: "image/jpeg" });
}

describe("UploadCard", () => {
  // jsdom does not implement createObjectURL; the thumbnail preview genuinely
  // needs it in a real browser, this just stubs the gap in the test environment.
  URL.createObjectURL = vi.fn(() => "blob:mock");

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("multi-page: staged files can be reordered and removed before confirming", async () => {
    const user = userEvent.setup();
    render(<UploadCard onCreated={() => undefined} />);
    await user.click(screen.getByText(/ajouter un cours/i));

    const input = screen.getByLabelText(/photos ou document/i);
    await user.upload(input, [aFile("a.jpg"), aFile("b.jpg"), aFile("c.jpg")]);

    const names = () => screen.getAllByText(/\.jpg$/).map((el) => el.textContent);
    expect(names()).toEqual(["a.jpg", "b.jpg", "c.jpg"]);

    await user.click(screen.getByRole("button", { name: /descendre a\.jpg/i }));
    expect(names()).toEqual(["b.jpg", "a.jpg", "c.jpg"]);

    await user.click(screen.getByRole("button", { name: /retirer b\.jpg/i }));
    expect(names()).toEqual(["a.jpg", "c.jpg"]);
  });

  it("'Confirmer' pairs a decorative icon with its label — the accessible name stays exactly the label (docs/UI.md's Icons note)", async () => {
    const user = userEvent.setup();
    render(<UploadCard onCreated={() => undefined} />);
    await user.click(screen.getByText(/ajouter un cours/i));
    await user.upload(screen.getByLabelText(/photos ou document/i), aFile("a.jpg"));

    const button = screen.getByRole("button", { name: "Confirmer" });
    const icon = button.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).toHaveAttribute("focusable", "false");
  });

  it("shows an explicit error and does not clear the form when upload fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/documents") && !url.includes("/pages")) {
          return Promise.resolve(new Response(JSON.stringify({ id: "d1" }), { status: 201 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ error: "duplicate" }), { status: 409 }));
      }),
    );
    const user = userEvent.setup();
    render(<UploadCard onCreated={() => undefined} />);
    await user.click(screen.getByText(/ajouter un cours/i));
    await user.upload(screen.getByLabelText(/photos ou document/i), aFile("a.jpg"));

    await user.click(screen.getByRole("button", { name: /confirmer/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/déjà été ajoutée/i);
  });

  it("rolls back the abandoned document from a refused upload, and a later valid upload is unaffected", async () => {
    const calls: { method: string; url: string }[] = [];
    let createCount = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        calls.push({ method, url });

        if (method === "POST" && url === "/api/documents") {
          createCount += 1;
          const id = createCount === 1 ? "doc-a" : "doc-b";
          return Promise.resolve(new Response(JSON.stringify({ id }), { status: 201 }));
        }
        if (method === "POST" && url === "/api/documents/doc-a/pages") {
          return Promise.resolve(new Response(JSON.stringify({ error: "duplicate" }), { status: 409 }));
        }
        if (method === "DELETE" && url === "/api/documents/doc-a") {
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        if (method === "POST" && url === "/api/documents/doc-b/pages") {
          return Promise.resolve(new Response(JSON.stringify({}), { status: 201 }));
        }
        if (method === "POST" && url === "/api/documents/doc-b/extract") {
          return Promise.resolve(new Response(JSON.stringify({ jobId: "job-1" }), { status: 202 }));
        }
        throw new Error(`unexpected fetch: ${method} ${url}`);
      }),
    );

    const user = userEvent.setup();
    const onCreated = vi.fn();
    render(<UploadCard onCreated={onCreated} />);

    // Course A: a page is refused as a duplicate, the confirmation is
    // refused on screen.
    await user.click(screen.getByText(/ajouter un cours/i));
    await user.upload(screen.getByLabelText(/photos ou document/i), aFile("a.jpg"));
    await user.click(screen.getByRole("button", { name: /confirmer/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/déjà été ajoutée/i);

    // The document created for the refused course must not survive the
    // refusal: nothing should be left "en attente" forever with no job.
    expect(calls).toContainEqual({ method: "DELETE", url: "/api/documents/doc-a" });

    // Course B: a second, valid course, uploaded right after.
    await user.clear(screen.getByLabelText(/titre du cours/i));
    await user.click(screen.getByRole("button", { name: /retirer a\.jpg/i }));
    await user.upload(screen.getByLabelText(/photos ou document/i), aFile("b.jpg"));
    await user.click(screen.getByRole("button", { name: /confirmer/i }));

    await vi.waitFor(() => expect(onCreated).toHaveBeenCalled());

    expect(calls).toContainEqual({ method: "POST", url: "/api/documents/doc-b/extract" });
    // Course B was never deleted.
    expect(calls).not.toContainEqual({ method: "DELETE", url: "/api/documents/doc-b" });
  });
});
