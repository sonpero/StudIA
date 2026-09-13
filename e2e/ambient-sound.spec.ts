import { expect, test } from "@playwright/test";
import { TEST_USERNAME } from "./support/env.js";

// M10 Phase 2, lot 4: StudySoundsCard is real, synthesized ambient noise
// now, not a mock music player — no audio file, no third-party embed. This
// scenario is the one Web Audio playback itself cannot prove from a unit
// test: a real page, a real click, the sound surviving a screen change
// (decision 3 — the graph lives in AmbientSoundEffects, mounted once in
// App.tsx), and the header's own stop control (decision 3's direct
// consequence) reachable from that other screen. 375x812 is this project's
// own reference width (docs/UI.md's Responsive conventions) — the same
// viewport the header-width fix (docs/UI.md's Aujourd'hui — study sounds
// note) was measured against.
test.describe("ambient sound", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("starting a sound survives navigating to another screen, where the header's own stop control appears and works, with no horizontal overflow", async ({ page }) => {
    test.setTimeout(30_000);
    await page.goto("/");
    await page.getByRole("button", { name: "Aujourd'hui" }).click();
    await expect(page.getByRole("heading", { name: `Bonjour, ${TEST_USERNAME}` })).toBeVisible();

    const studySoundsCard = page.getByTestId("study-sounds-card");
    await expect(studySoundsCard.getByRole("radio", { name: "Bruit blanc" })).toBeChecked();

    await studySoundsCard.getByRole("button", { name: "Lecture" }).click();
    await expect(studySoundsCard.getByRole("button", { name: "Pause" })).toBeVisible();

    // Still on Aujourd'hui: the header must not carry a second, redundant
    // stop control — StudySoundsCard already has one under a different name.
    await expect(page.getByRole("button", { name: "Couper le son d'ambiance" })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

    await page.getByRole("button", { name: "Mes cours", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Mes cours" })).toBeVisible();

    // The sound survived the navigation (decision 3): the header's own
    // stop control is now visible, distinct from StudySoundsCard's own
    // play/pause toggle, which is not on screen at all here.
    const stopControl = page.getByRole("button", { name: "Couper le son d'ambiance" });
    await expect(stopControl).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

    await stopControl.click();
    await expect(stopControl).toHaveCount(0);

    // Back on Aujourd'hui, the card agrees the sound is paused — the same
    // shared state, not a second, independently-tracked copy of it.
    await page.getByRole("button", { name: "Aujourd'hui" }).click();
    await expect(studySoundsCard.getByRole("button", { name: "Lecture" })).toBeVisible();
  });
});
