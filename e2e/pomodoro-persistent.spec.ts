import { expect, test } from "@playwright/test";
import { TEST_USERNAME } from "./support/env.js";

// Lot 1 of 3 of the persistent-pomodoro work (CLAUDE.md's session history):
// a running session stays visible everywhere via a small header widget and
// the browser tab title, not just on Aujourd'hui. The widget itself is
// hidden on Aujourd'hui specifically — PomodoroCard already shows the same
// countdown there — so this scenario proves the cross-screen case: start
// on Aujourd'hui, navigate away, and the countdown is still live elsewhere.
test.describe("persistent pomodoro (lot 1)", () => {
  test("a live session stays visible in the header and the tab title while navigating away from Aujourd'hui", async ({ page }) => {
    test.setTimeout(30_000);
    await page.goto("/");
    await page.getByRole("button", { name: "Aujourd'hui" }).click();
    await expect(page.getByRole("heading", { name: `Bonjour, ${TEST_USERNAME}` })).toBeVisible();

    const pomodoroCard = page.getByTestId("pomodoro-card");
    await pomodoroCard.getByRole("button", { name: "Démarrer" }).click();
    await expect(pomodoroCard.getByRole("button", { name: "Terminer" })).toBeVisible({ timeout: 10_000 });

    // Still on Aujourd'hui: the header widget must not exist at all (not
    // just be visually hidden) — PomodoroCard already shows this countdown.
    await expect(page.getByTestId("pomodoro-header-widget")).toHaveCount(0);

    await page.getByRole("button", { name: "Mes cours", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Mes cours" })).toBeVisible();

    await expect(page.getByTestId("pomodoro-header-widget")).toBeVisible();
    await expect(page.getByTestId("pomodoro-header-widget")).toHaveText(/^\d{2}:\d{2}$/);
    await expect(page).toHaveTitle(/^\d{2}:\d{2} · StudIA$/);

    // Back to Aujourd'hui: the widget hides again, the still-live session
    // resumes on PomodoroCard (not reset — the ÉTAPE 0 regression this lot
    // fixed, exercised here through real navigation rather than a unit
    // test's simulated remount).
    await page.getByRole("button", { name: "Aujourd'hui" }).click();
    await expect(page.getByRole("button", { name: "Terminer" })).toBeVisible();
    await expect(page.getByTestId("pomodoro-header-widget")).toHaveCount(0);

    await page.getByRole("button", { name: "Terminer" }).click();
    await expect(page.getByRole("button", { name: "Démarrer" })).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveTitle("StudIA");
  });
});
