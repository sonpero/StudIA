import { expect, test } from "@playwright/test";

// docs/MILESTONES.md's M5 demo: "Set an exam date, see coverage and
// readiness for the course, review a due card, see readiness rise." The
// browser clock is mocked throughout (never real wall time): "today" is
// client-computed (apps/web/src/lib/day-boundary.ts's todayDateKey,
// product decision — the server never guesses it, docs/modules/progress.md).
test.describe("progress", () => {
  test("set a deadline, see coverage and readiness, review a due card, see readiness rise", async ({ page }) => {
    test.setTimeout(60_000); // extra room for the split/generation polls
    const mockedNow = new Date(2026, 2, 2, 9, 0, 0); // Monday 2026-03-02, 09:00 local
    await page.clock.install({ time: mockedNow });

    await page.goto("/");

    // The app's home is now Aujourd'hui (M9), not Mes cours — UploadCard is
    // always open once there, no "+ Ajouter un cours" toggle to click through.
    await page.getByRole("button", { name: "Mes cours", exact: true }).click();
    await page.getByLabel("Titre du cours").fill("Cours à suivre");
    await page.getByLabel(/dépose un fichier/i).setInputFiles({ name: "page.jpg", mimeType: "image/jpeg", buffer: Buffer.from("page") });
    await page.getByRole("button", { name: "Créer le cours" }).click();

    const documentCard = page.getByTestId("document-card").filter({ hasText: "Cours à suivre" });
    await expect(documentCard.getByRole("button", { name: "Lire le cours" })).toBeVisible({ timeout: 15_000 });

    // Notions no longer has its own per-card entry point on Mes cours (M9's
    // later redesign): the nav's own "Notions" destination, then this
    // course's own pill, land on its notions directly.
    await page.getByRole("button", { name: "Notions", exact: true }).click();
    await page.getByRole("button", { name: "Cours à suivre", exact: true }).click();

    // content splits notions automatically after extraction
    // (docs/modules/content.md); NotionsScreen polls while empty.
    const notionCards = page.getByTestId("notion-card");
    await expect(notionCards.first()).toBeVisible({ timeout: 15_000 });
    const notionCount = await notionCards.count();

    // Lecteur opened from a course's own Notions page returns there, not to
    // Mes cours (docs/UI.md's Lecteur note — same fromDocumentId-shaped
    // mechanic as this screen's own Progression round trip, checked further
    // down).
    await page.getByRole("button", { name: "Lire le cours" }).click();
    await expect(page.getByTestId("reader-study-panel")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Retour" }).click();
    await expect(page.getByRole("heading", { name: "Cours à suivre" })).toBeVisible();

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

    // "Voir la progression" pre-selects this exact course (fromDocumentId,
    // docs/UI.md's Progression note) — one detail card, not a filtered
    // pick among several, even though other specs' own courses coexist in
    // the shared e2e database (docs/TESTING.md's "one database per run").
    const progressCard = page.getByTestId("progress-detail-card");
    await expect(progressCard.getByText("Cours à suivre")).toBeVisible({ timeout: 10_000 });

    // No deadline yet: the two raw numbers and an invitation, no countdown.
    // "0 %" appears three times — coverage's own bar, plus readiness
    // duplicated on both the ring and its own linear bar (docs/UI.md's
    // Progression note).
    await expect(progressCard.getByText("0 %")).toHaveCount(3);
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
    // The whole-course review entry point (its own "Réviser N fiches"
    // button, distinct from each notion card's own plain "Réviser") — this
    // fixture document has 5 notions (fixture-notion-splitter.ts), so a bare
    // exact "Réviser" match would hit more than one of those instead.
    await page.getByTestId("notions-course-summary").getByRole("button", { name: /^réviser/i }).click();
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
    const progressCardAfter = page.getByTestId("progress-detail-card");
    const readinessMeterAfter = progressCardAfter.getByRole("meter", { name: "Préparation" });
    await expect
      .poll(async () => Number(await readinessMeterAfter.getAttribute("aria-valuenow")), { timeout: 10_000, message: "waiting for readiness to rise above its pre-review floor" })
      .toBeGreaterThan(readinessBefore);
  });
});
