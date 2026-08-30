import { expect, test } from "@playwright/test";

// docs/MILESTONES.md's M5 demo: "Set an exam date, see coverage and
// readiness for the course, review a due card, see readiness rise." The
// browser clock is mocked throughout (never real wall time): "today" is
// client-computed (apps/web/src/lib/day-boundary.ts's todayDateKey,
// product decision — the server never guesses it, docs/modules/progress.md).
test.describe("progress", () => {
  test("set a deadline, see coverage and readiness, review a due card, see readiness rise", async ({ page }) => {
    test.setTimeout(90_000); // extra room for the split/generation polls under full-suite parallel load
    const mockedNow = new Date(2026, 2, 2, 9, 0, 0); // Monday 2026-03-02, 09:00 local
    await page.clock.install({ time: mockedNow });

    await page.goto("/");

    await page.getByText("+ Ajouter un cours").click();
    await page.getByLabel("Titre du cours").fill("Cours à suivre");
    await page.getByLabel("Photos ou document").setInputFiles({ name: "page.jpg", mimeType: "image/jpeg", buffer: Buffer.from("page") });
    await page.getByRole("button", { name: "Confirmer" }).click();

    const documentCard = page.getByTestId("document-card").filter({ hasText: "Cours à suivre" });
    // Generous: the worker process is shared with every other e2e spec's
    // jobs, and under full-suite parallel load this one can sit in the
    // queue behind extraction/split/generation jobs from other specs
    // (same contention e2e/today.spec.ts's and e2e/todo-photo.spec.ts's
    // own generous timeouts already accommodate — e2e/calendar.spec.ts
    // now adds a sixth document-creation-heavy spec to that same load).
    await expect(documentCard.getByText("Terminé")).toBeVisible({ timeout: 45_000 });
    await documentCard.getByRole("button", { name: "Voir les notions" }).click();

    // content splits notions automatically after extraction
    // (docs/modules/content.md); NotionsScreen polls while empty.
    const notionCards = page.getByTestId("notion-card");
    await expect(notionCards.first()).toBeVisible({ timeout: 15_000 });
    const notionCount = await notionCards.count();

    await page.getByRole("button", { name: "Créer les fiches" }).click();

    const docsRes = await page.request.get("/api/documents");
    const documents = (await docsRes.json()) as { id: string; title: string }[];
    const documentId = documents.find((d) => d.title === "Cours à suivre")?.id;
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

    await page.getByRole("button", { name: "Voir la progression" }).click();
    await expect(page.getByRole("heading", { name: "Progression" })).toBeVisible();

    const progressCard = page.getByTestId("progress-card").filter({ hasText: "Cours à suivre" });
    await expect(progressCard).toBeVisible({ timeout: 10_000 });

    // No deadline yet: the two raw numbers and an invitation, no countdown.
    await expect(progressCard.getByText("0 %")).toHaveCount(2);
    await expect(progressCard.getByRole("button", { name: "Définir une échéance" })).toBeVisible();

    await progressCard.getByRole("button", { name: "Définir une échéance" }).click();
    const deadline = new Date(mockedNow);
    deadline.setDate(deadline.getDate() + 14);
    const deadlineValue = deadline.toISOString().slice(0, 10);
    await progressCard.getByLabel("Date").fill(deadlineValue);
    await progressCard.getByRole("button", { name: "Enregistrer" }).click();

    await expect(progressCard.getByText(/contrôle dans 14 jours/i)).toBeVisible({ timeout: 10_000 });
    // Exact meter values, not rounded display text: FSRS's first-review
    // stability is small enough that a single review's readiness
    // contribution can round to "0 %" once averaged over every notion —
    // true progress, not a bug, and exactly why this assertion reads the
    // precise value rather than assuming it clears a rounding threshold.
    const readinessBefore = Number(await progressCard.getByRole("meter", { name: "Préparation" }).getAttribute("aria-valuenow"));
    expect(readinessBefore).toBe(0);

    // Leave for the review screen: this app has no router (App.tsx is a
    // small in-memory state machine), so "go review, then come back" is
    // leaving and returning, the way a real user would.
    await page.getByText("Retour").click();
    await expect(notionCards.first()).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Réviser", exact: true }).click();
    await expect(page.getByRole("button", { name: "Révéler la réponse" })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Révéler la réponse" }).click();
    await page.getByRole("button", { name: "Correct" }).click();

    await page.getByRole("button", { name: "Quitter" }).click();
    await expect(notionCards.first()).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Voir la progression" }).click();
    await expect(page.getByRole("heading", { name: "Progression" })).toBeVisible();

    // Readiness has risen off its floor now that a card has been
    // reviewed — the observable proof progress actually moved, not just
    // that a request was accepted. aria-valuenow carries the FSRS-exact
    // value (a whole percentage point, per Gauge's rounding), so this
    // compares real numbers rather than re-parsing display text.
    const progressCardAfter = page.getByTestId("progress-card").filter({ hasText: "Cours à suivre" });
    const readinessMeterAfter = progressCardAfter.getByRole("meter", { name: "Préparation" });
    await expect
      .poll(async () => Number(await readinessMeterAfter.getAttribute("aria-valuenow")), { timeout: 10_000, message: "waiting for readiness to rise above its pre-review floor" })
      .toBeGreaterThan(readinessBefore);
  });
});
