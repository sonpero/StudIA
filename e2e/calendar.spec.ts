import { expect, test } from "@playwright/test";

// docs/UI.md's Calendrier note + docs/modules/workspace.md's Calendar
// section: a month grid composing progress's deadlines and workspace's
// own dated todos, a day's dot clicking through to its full contents, and
// colour that only ever marks a course, never how soon something is due.
test.describe("calendar", () => {
  test("a deadline and a todo appear on their own days, a deadline's day links to its course, and month navigation actually changes what's shown", async ({ page }) => {
    test.setTimeout(60_000); // extra room: extraction, a deadline, a todo, and month navigation
    const mockedNow = new Date(2026, 2, 2, 9, 0, 0); // Monday 2026-03-02, 09:00 local
    await page.clock.install({ time: mockedNow });

    await page.goto("/");

    await page.getByText("+ Ajouter un cours").click();
    await page.getByLabel("Titre du cours").fill("Cours du calendrier");
    await page.getByLabel("Photos ou document").setInputFiles({ name: "page.jpg", mimeType: "image/jpeg", buffer: Buffer.from("page") });
    await page.getByRole("button", { name: "Confirmer" }).click();

    const documentCard = page.getByTestId("document-card").filter({ hasText: "Cours du calendrier" });
    await expect(documentCard.getByText("Terminé")).toBeVisible({ timeout: 15_000 });
    await documentCard.getByRole("button", { name: "Voir les notions" }).click();

    const notionCards = page.getByTestId("notion-card");
    await expect(notionCards.first()).toBeVisible({ timeout: 15_000 });

    // Set a deadline for this course, same flow e2e/progress.spec.ts uses.
    await page.getByRole("button", { name: "Voir la progression" }).click();
    const progressCard = page.getByTestId("progress-card").filter({ hasText: "Cours du calendrier" });
    await expect(progressCard).toBeVisible({ timeout: 10_000 });
    await progressCard.getByRole("button", { name: "Définir une échéance" }).click();
    await progressCard.getByLabel("Date").fill("2026-03-20");
    await progressCard.getByRole("button", { name: "Enregistrer" }).click();
    await expect(progressCard.getByText(/contrôle dans/i)).toBeVisible({ timeout: 10_000 });

    // A course-less todo dated inside the same month, same flow
    // e2e/today.spec.ts uses.
    await page.getByRole("button", { name: "Aujourd'hui" }).click();
    // Collapsed by default behind its own trigger (docs/UI.md), same as
    // e2e/today.spec.ts's manual-add flow.
    await page.getByRole("button", { name: "Ajouter un todo" }).click();
    await page.getByLabel("Nouveau todo").fill("Réviser le chapitre 3");
    await page.getByLabel("Date (facultatif)").fill("2026-03-15");
    await page.getByRole("button", { name: "Ajouter", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "Réviser le chapitre 3" })).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Calendrier" }).click();
    await expect(page.getByRole("heading", { name: "Mars 2026" })).toBeVisible();

    const deadlineDay = page.getByTestId("calendar-day-2026-03-20");
    const todoDay = page.getByTestId("calendar-day-2026-03-15");
    await expect(deadlineDay.getByRole("img")).toHaveCount(1);
    await expect(todoDay.getByRole("img")).toHaveCount(1);

    // The deadline's day: dot links through to the panel, panel links
    // through to the course itself.
    await deadlineDay.click();
    const panel = page.getByTestId("day-panel");
    await expect(panel.getByText("Cours du calendrier")).toBeVisible();
    await panel.getByRole("button", { name: "Voir le cours" }).click();
    await expect(notionCards.first()).toBeVisible({ timeout: 10_000 });

    // The todo's day: read-only in the panel, no course link, since it
    // has no course.
    await page.getByRole("button", { name: "Calendrier" }).click();
    await todoDay.click();
    await expect(panel.getByText("Réviser le chapitre 3")).toBeVisible();
    await expect(panel.getByRole("button", { name: "Voir le cours" })).toHaveCount(0);

    // Month navigation actually changes what's fetched and shown: April
    // has neither day, and paging back to March brings both dots back.
    await page.getByRole("button", { name: /mois suivant/i }).click();
    await expect(page.getByRole("heading", { name: "Avril 2026" })).toBeVisible();
    await expect(page.getByTestId("calendar-day-2026-04-20").getByRole("img")).toHaveCount(0);

    await page.getByRole("button", { name: /mois précédent/i }).click();
    await expect(page.getByRole("heading", { name: "Mars 2026" })).toBeVisible();
    await expect(page.getByTestId("calendar-day-2026-03-20").getByRole("img")).toHaveCount(1);
  });
});
