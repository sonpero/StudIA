// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { SpotifyCard } from "./SpotifyCard.js";

describe("SpotifyCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("collapsed by default: no iframe in the DOM at all, only the trigger", () => {
    render(<SpotifyCard />);
    expect(screen.getByText("Musique")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Écouter" })).toBeInTheDocument();
    expect(document.querySelector("iframe")).not.toBeInTheDocument();
  });

  it("clicking Écouter mounts an iframe pointed at the fixed playlist embed, with an accessible title", async () => {
    render(<SpotifyCard />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Écouter" }));

    const iframe = document.querySelector("iframe");
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute("src", "https://open.spotify.com/embed/playlist/37i9dQZF1DX3PFzdbtx1Us");
    expect(iframe).toHaveAccessibleName(/spotify/i);
  });

  it("Fermer unmounts the iframe, returning to the collapsed state", async () => {
    render(<SpotifyCard />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Écouter" }));
    expect(document.querySelector("iframe")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Fermer" }));
    expect(document.querySelector("iframe")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Écouter" })).toBeInTheDocument();
  });
});
