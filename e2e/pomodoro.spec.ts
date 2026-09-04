import { expect, test } from "@playwright/test";

// docs/MILESTONES.md's M7 demo: "Start a pomodoro on today's task, finish
// it, see the session recorded." No history this milestone
// (docs/modules/workspace.md's Pomodoro note) — "recorded" here means the
// server-sourced confirmation line, not a persisted log; a reload returns
// to the repos state, asserted at the end.
test.describe("pomodoro", () => {
  test("start a session on a todo, see the countdown, finish it, and a reload resets to repos", async ({ page }) => {
    test.setTimeout(30_000);
    await page.goto("/");
    await page.getByRole("button", { name: "Aujourd'hui" }).click();
    await expect(page.getByRole("heading", { name: "Aujourd'hui" })).toBeVisible();

    await page.getByRole("button", { name: "Ajouter un todo" }).click();
    await page.getByLabel("Nouveau todo").fill("Réviser le chapitre 3");
    await page.getByRole("button", { name: "Ajouter", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "Réviser le chapitre 3" })).toBeVisible({ timeout: 10_000 });

    const pomodoroCard = page.getByTestId("pomodoro-card");
    await pomodoroCard.getByLabel("Todo (facultatif)").selectOption({ label: "Réviser le chapitre 3" });
    await pomodoroCard.getByRole("button", { name: "Démarrer" }).click();

    await expect(pomodoroCard.getByRole("button", { name: "Terminer" })).toBeVisible({ timeout: 10_000 });
    await expect(pomodoroCard.getByText("sur « Réviser le chapitre 3 »")).toBeVisible();
    await expect(pomodoroCard.getByTestId("pomodoro-countdown")).toContainText(":");

    await pomodoroCard.getByRole("button", { name: "Terminer" }).click();
    await expect(pomodoroCard.getByText(/séance terminée/i)).toBeVisible({ timeout: 10_000 });
    await expect(pomodoroCard.getByText(/25 minutes/)).toBeVisible();

    // No history this milestone: a reload finds no active session and
    // resets to the repos state, not the confirmation line.
    await page.reload();
    await page.getByRole("button", { name: "Aujourd'hui" }).click();
    await expect(page.getByTestId("pomodoro-card").getByRole("button", { name: "Démarrer" })).toBeVisible({ timeout: 10_000 });
  });
});
