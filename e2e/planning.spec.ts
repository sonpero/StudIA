import { expect, test } from "@playwright/test";

// docs/MILESTONES.md's M5 demo: "Set an exam date two weeks out, get a
// daily plan, skip a day, watch the plan redistribute." The browser clock
// is mocked throughout (never real wall time): "today" is client-computed
// (apps/web/src/lib/day-boundary.ts's todayDateKey, product decision — the
// server never guesses it, docs/modules/planning.md), so advancing the
// mocked clock is what "skipping a day" means here, exactly like the
// existing dayBoundary e2e test for review.
test.describe("planning", () => {
  test("set a deadline two weeks out, see the daily plan, skip a day, see it redistribute", async ({ page }) => {
    test.setTimeout(60_000); // extra room for the split poll under full-suite parallel load
    const mockedNow = new Date(2026, 2, 2, 9, 0, 0); // Monday 2026-03-02, 09:00 local
    await page.clock.install({ time: mockedNow });

    await page.goto("/");

    await page.getByText("+ Ajouter un cours").click();
    await page.getByLabel("Titre du cours").fill("Cours à planifier");
    await page.getByLabel("Photos ou document").setInputFiles({ name: "page.jpg", mimeType: "image/jpeg", buffer: Buffer.from("page") });
    await page.getByRole("button", { name: "Confirmer" }).click();

    const documentCard = page.getByTestId("document-card").filter({ hasText: "Cours à planifier" });
    await expect(documentCard.getByText("Terminé")).toBeVisible({ timeout: 15_000 });
    await documentCard.getByRole("button", { name: "Voir les notions" }).click();

    // content splits notions automatically after extraction; NotionsScreen
    // polls while empty, so this is a genuine wait for the worker.
    await expect(page.getByTestId("notion-card").first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Planning" }).click();
    await expect(page.getByRole("heading", { name: "Planning" })).toBeVisible();

    // Empty (setup-needed) state: no availability has ever been set for
    // this account, so the plan is a 422 no-capacity, not a generic error.
    await expect(page.getByText(/indique combien de temps/i)).toBeVisible();

    for (const label of ["Lun", "Mar", "Mer", "Jeu", "Ven"]) {
      await page.getByLabel(label, { exact: true }).fill("60");
    }
    await page.getByRole("button", { name: "Enregistrer mes disponibilités" }).click();

    // Availability alone (no deadline yet) makes a steady plan: the
    // setup-needed prompt is gone and the daily plan is showing.
    await expect(page.getByText(/indique combien de temps/i)).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/apprentissage/i).first()).toBeVisible({ timeout: 10_000 });

    // Set a deadline two weeks out, per the milestone's demo scenario.
    await page.getByText("Changer l'échéance ou mes disponibilités").click();
    const deadline = new Date(mockedNow);
    deadline.setDate(deadline.getDate() + 14);
    const deadlineValue = deadline.toISOString().slice(0, 10);
    await page.getByLabel("Date", { exact: true }).fill(deadlineValue);
    await page.getByRole("button", { name: "Définir l'échéance" }).click();

    // Today's own plan entry is visible: same calendar day as the mocked
    // clock, formatted the way PlanningScreen renders it (fr-FR, lowercase
    // weekday — capitalisation is CSS-only, not in the text content).
    const todayLabel = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(mockedNow);
    await expect(page.getByText(todayLabel, { exact: false })).toBeVisible({ timeout: 10_000 });

    const firstEntryText = await page.getByText(/apprentissage|révision/i).first().textContent();
    expect(firstEntryText).toBeTruthy();

    // Skip a day: advance the mocked clock past midnight. No explicit
    // "skip" action exists (docs/modules/planning.md's Replanning section:
    // there is no separate replan algorithm) — the next fetch simply
    // computes "today" as the new day and redistributes what remains.
    const nextDay = new Date(mockedNow);
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(9, 0, 0, 0);
    await page.clock.setFixedTime(nextDay);

    // No router (App.tsx is a small in-memory state machine, not URL-based):
    // a full page reload would lose the SPA's navigation state entirely, so
    // "checking the plan again" is leaving and coming back, the way a real
    // user would the next day — not a page reload.
    await page.getByText("Retour").click();
    await expect(page.getByTestId("notion-card").first()).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Planning" }).click();

    await expect(page.getByRole("heading", { name: "Planning" })).toBeVisible();
    const newTodayLabel = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(nextDay);
    await expect(page.getByText(newTodayLabel, { exact: false })).toBeVisible({ timeout: 10_000 });
    // The plan redistributed onto the new "today": what was scheduled for
    // the old mocked day is no longer the first thing shown.
    await expect(page.getByText(todayLabel, { exact: false })).not.toBeVisible();
  });
});
