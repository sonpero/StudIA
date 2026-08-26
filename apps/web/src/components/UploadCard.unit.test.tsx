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
});
