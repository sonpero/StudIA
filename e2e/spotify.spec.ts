import { expect, test } from "@playwright/test";

// docs/MILESTONES.md's M7 acceptance: "Spotify is an embedded playlist, no
// OAuth, no Premium requirement." docs/UI.md's Aujourd'hui — Spotify note:
// no <iframe> exists in the DOM at all until the explicit click, which is
// the property this test asserts directly rather than inferring from a
// network log a Playwright test cannot easily inspect for CSP behaviour.
test.describe("spotify", () => {
  test("no iframe before the click; Écouter mounts the fixed playlist embed; Fermer unmounts it", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Aujourd'hui" }).click();
    await expect(page.getByRole("heading", { name: "Aujourd'hui" })).toBeVisible();

    const spotifyCard = page.getByTestId("spotify-card");
    await expect(spotifyCard.getByRole("button", { name: "Écouter" })).toBeVisible();
    await expect(spotifyCard.locator("iframe")).toHaveCount(0);

    await spotifyCard.getByRole("button", { name: "Écouter" }).click();
    const iframe = spotifyCard.locator("iframe");
    await expect(iframe).toHaveAttribute("src", "https://open.spotify.com/embed/playlist/37i9dQZF1DX3PFzdbtx1Us");

    await spotifyCard.getByRole("button", { name: "Fermer" }).click();
    await expect(spotifyCard.locator("iframe")).toHaveCount(0);
    await expect(spotifyCard.getByRole("button", { name: "Écouter" })).toBeVisible();
  });
});
