import { expect, test } from "@playwright/test";

// A local calendar-day key, computed the same way the browser's own
// todayDateKey (apps/web/src/lib/day-boundary.ts) does — local year/month/
// day components, never a UTC-sliced ISO string, so this stays exactly N
// calendar days from whatever "today" the browser itself reports, with no
// timezone-conversion drift between this Node process and that page.
function localDateKeyPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// docs/MILESTONES.md's M9 acceptance: "a course with a deadline shows the
// countdown badge; a user with at least one review today or yesterday sees
// a non-zero streak." No clock mocking here, deliberately: a review's
// reviewed_at is stamped by the server's own real clock
// (opts.clock.now(), apps/api/src/routes/review.ts), not the browser's —
// mocking the browser clock to an arbitrary date would desync the two and
// make the streak never see today's own review.
test.describe("streak and countdown badge (M9)", () => {
  test("a course's deadline shows the relative countdown badge, and a review today gives a non-zero streak", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/");

    await page.getByText("+ Ajouter un cours").click();
    await page.getByLabel("Titre du cours").fill("Cours du streak");
    await page.getByLabel("Photos ou document").setInputFiles({ name: "page.jpg", mimeType: "image/jpeg", buffer: Buffer.from("page") });
    await page.getByRole("button", { name: "Confirmer" }).click();

    const documentCard = page.getByTestId("document-card").filter({ hasText: "Cours du streak" });
    await expect(documentCard.getByText("Terminé")).toBeVisible({ timeout: 15_000 });
    await documentCard.getByRole("button", { name: "Voir les notions" }).click();

    const notionCards = page.getByTestId("notion-card");
    await expect(notionCards.first()).toBeVisible({ timeout: 15_000 });
    const notionCount = await notionCards.count();

    await page.getByRole("button", { name: "Créer les fiches" }).click();

    const docsRes = await page.request.get("/api/documents");
    const documents = (await docsRes.json()) as { id: string; title: string }[];
    const documentId = documents.find((d) => d.title === "Cours du streak")?.id;
    if (!documentId) throw new Error("expected the just-created document to be listed");

    await expect
      .poll(
        async () => {
          const res = await page.request.get(`/api/documents/${documentId}/generation-status`);
          const status = (await res.json()) as { done: number; total: number; failed: number };
          return status.done + status.failed;
        },
        { timeout: 45_000, message: "waiting for every notion's generate-cards job to finish" },
      )
      .toBe(notionCount);

    // A deadline, for the countdown badge.
    await page.getByRole("button", { name: "Voir la progression" }).click();
    const progressCard = page.getByTestId("progress-card").filter({ hasText: "Cours du streak" });
    await expect(progressCard).toBeVisible({ timeout: 10_000 });
    await progressCard.getByRole("button", { name: "Définir une échéance" }).click();
    await progressCard.getByLabel("Date").fill(localDateKeyPlusDays(14));
    await progressCard.getByRole("button", { name: "Enregistrer" }).click();
    await expect(progressCard.getByText(/dans 14 jours/i)).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Aujourd'hui" }).click();
    await expect(page.getByRole("heading", { name: "Aujourd'hui" })).toBeVisible();

    const courseCard = page.getByTestId("course-today-card").filter({ hasText: "Cours du streak" });
    await expect(courseCard).toBeVisible({ timeout: 10_000 });
    // The relative form only — no absolute date, no custom label
    // (docs/UI.md's Aujourd'hui — deadline note: the badge is a fixed,
    // generic "Examen", not a repaint of Progression's own labelled fact).
    await expect(courseCard.getByText("Examen dans 14 jours")).toBeVisible();

    // A review today: submit one, then see the streak read at least 1.
    // Not asserting it was 0 before — other e2e specs sharing this same
    // account/day (docs/TESTING.md's "one database per run") may already
    // have reviewed something today by the time this spec runs.
    await courseCard.getByRole("button", { name: "Réviser" }).click();
    await page.getByRole("button", { name: "Révéler la réponse" }).click();
    await page.getByRole("button", { name: "Correct" }).click();
    await page.getByRole("button", { name: "Quitter" }).click();

    await page.getByRole("button", { name: "Aujourd'hui" }).click();
    const streakCard = page.getByTestId("streak-card");
    await expect(streakCard).toBeVisible({ timeout: 10_000 });

    // Polled, not read once: this mount's own ["today"] query can render
    // once from a still-cached pre-review value before its background
    // refetch (TanStack Query's default staleTime: 0) resolves — a real
    // async gap in the page, not a reason to fake a passing test.
    await expect
      .poll(async () => Number(await streakCard.getByTestId("streak-count").textContent()), { timeout: 10_000, message: "waiting for the streak to reflect the review just submitted" })
      .toBeGreaterThanOrEqual(1);
    await expect(streakCard.getByText("Continue comme ça !")).toBeVisible();
  });
});
