import { expect, test } from "@playwright/test";
import { TEST_USERNAME } from "./support/env.js";

// docs/MILESTONES.md's M7 demo: "Start a pomodoro, finish it, see the
// session recorded." M9's Aujourd'hui redesign (apps/web/src/screens/
// TodayScreen.tsx's own PomodoroCard) dropped the optional todo-linking
// select — startPomodoro is now always called with no todoId, by product
// decision, not an oversight — and "recorded" is now the session counter
// ("N séances de concentration"), not a separate confirmation banner. No
// history this milestone (docs/modules/workspace.md's Pomodoro note): a
// reload finds no active session and resets to the repos state, including
// that counter.
test.describe("pomodoro", () => {
  test("start a session, see the countdown, finish it, and a reload resets to repos", async ({ page }) => {
    test.setTimeout(30_000);
    await page.goto("/");
    await page.getByRole("button", { name: "Aujourd'hui" }).click();
    // Aujourd'hui's own heading is the greeting now (M9's redesign), not the
    // page name — the nav item's own active state already covers that.
    await expect(page.getByRole("heading", { name: `Bonjour, ${TEST_USERNAME}` })).toBeVisible();

    const pomodoroCard = page.getByTestId("pomodoro-card");
    await expect(pomodoroCard.getByText("0 séance de concentration")).toBeVisible();

    await pomodoroCard.getByRole("button", { name: "Démarrer" }).click();

    await expect(pomodoroCard.getByRole("button", { name: "Terminer" })).toBeVisible({ timeout: 10_000 });
    await expect(pomodoroCard.getByText(/^\d{2}:\d{2}$/)).toBeVisible();

    await pomodoroCard.getByRole("button", { name: "Terminer" }).click();
    // "Recorded" now means the session counter incrementing (the redesign's
    // own replacement for the confirmation banner it dropped).
    await expect(pomodoroCard.getByRole("button", { name: "Démarrer" })).toBeVisible({ timeout: 10_000 });
    await expect(pomodoroCard.getByText("1 séance de concentration")).toBeVisible();

    // A reload resets the client-only session counter and finds no active
    // session server-side (no history this milestone).
    await page.reload();
    await page.getByRole("button", { name: "Aujourd'hui" }).click();
    const pomodoroCardAfterReload = page.getByTestId("pomodoro-card");
    await expect(pomodoroCardAfterReload.getByRole("button", { name: "Démarrer" })).toBeVisible({ timeout: 10_000 });
    await expect(pomodoroCardAfterReload.getByText("0 séance de concentration")).toBeVisible();
  });
});
