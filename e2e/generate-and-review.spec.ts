import { expect, test } from "@playwright/test";

// docs/MILESTONES.md's M3 demo: "From the document uploaded in M2, generate
// flashcards, review them, and see the next due date change according to
// the rating." docs/modules/generation.md: one generate-cards job per
// notion, never one per document.
test.describe("generate cards and review", () => {
  test("generate flashcards from an uploaded document, review one, and its due date moves out of the due window", async ({ page }) => {
    await page.goto("/");

    await page.getByText("+ Ajouter un cours").click();
    await page.getByLabel("Titre du cours").fill("Cours à réviser");
    await page.getByLabel("Photos ou document").setInputFiles({ name: "page.jpg", mimeType: "image/jpeg", buffer: Buffer.from("page") });
    await page.getByRole("button", { name: "Confirmer" }).click();

    const documentCard = page.getByTestId("document-card").filter({ hasText: "Cours à réviser" });
    await expect(documentCard.getByText("Terminé")).toBeVisible({ timeout: 15_000 });

    await documentCard.getByRole("button", { name: "Voir les notions" }).click();

    // content splits notions automatically after extraction
    // (docs/modules/content.md); NotionsScreen polls while empty, so this
    // is a genuine wait for the worker, not a UI blind spot.
    const notionCards = page.getByTestId("notion-card");
    await expect(notionCards.first()).toBeVisible({ timeout: 15_000 });
    const notionCount = await notionCards.count();
    expect(notionCount).toBeGreaterThanOrEqual(5); // content.md: 5 to 60 notions per document

    const docsRes = await page.request.get("/api/documents");
    const documents = (await docsRes.json()) as { id: string; title: string }[];
    const documentId = documents.find((d) => d.title === "Cours à réviser")?.id;
    if (!documentId) throw new Error("expected the just-created document to be listed");

    await page.getByRole("button", { name: "Créer les fiches" }).click();

    // One job per notion (docs/modules/generation.md's single most
    // consequential design choice): wait for all of them to finish before
    // starting a session, the way a real user would come back once ready,
    // rather than a blind sleep (docs/TESTING.md forbids waitForTimeout).
    await expect
      .poll(
        async () => {
          const res = await page.request.get(`/api/documents/${documentId}/generation-status`);
          const status = (await res.json()) as { done: number; total: number; failed: number };
          return status.done + status.failed;
        },
        { timeout: 20_000, message: "waiting for every notion's generate-cards job to finish" },
      )
      .toBe(notionCount);

    const dueBefore = (await (await page.request.get(`/api/review/due?documentId=${documentId}`)).json()) as { cardId: string; notionId: string }[];
    expect(dueBefore.length).toBeGreaterThan(0);
    const firstDueCardId = dueBefore[0]!.cardId;
    const firstDueNotionId = dueBefore[0]!.notionId;

    await page.getByRole("button", { name: "Réviser", exact: true }).click();

    await expect(page.getByRole("button", { name: "Révéler la réponse" })).toBeVisible({ timeout: 10_000 });
    // The review screen shows the fiche's due date (formerly missing
    // entirely): a never-reviewed card reads "Nouvelle fiche".
    await expect(page.getByText("Échéance : Nouvelle fiche")).toBeVisible();
    await page.getByRole("button", { name: "Révéler la réponse" }).click();
    await page.getByRole("button", { name: "Correct" }).click();

    // The rated card's next due date is now days out (FSRS default
    // parameters, docs/modules/review.md): it must no longer be in the
    // immediate due list. This is the observable proof that scheduling
    // actually advanced, not just that a request was accepted.
    await expect
      .poll(
        async () => {
          const due = (await (await page.request.get(`/api/review/due?documentId=${documentId}`)).json()) as { cardId: string }[];
          return due.some((card) => card.cardId === firstDueCardId);
        },
        { timeout: 10_000, message: "waiting for the rated card to drop out of the due list" },
      )
      .toBe(false);

    // Leave the whole-document session and confirm the due date change is
    // visible from the UI too, not just the API: reviewing that single
    // notion again now finds nothing due (docs/MILESTONES.md M3: "see the
    // next due date change"), and a notion can be reviewed on its own.
    const notionsRes = await page.request.get(`/api/documents/${documentId}/notions`);
    const notions = (await notionsRes.json()) as { id: string; title: string }[];
    const firstDueNotionTitle = notions.find((n) => n.id === firstDueNotionId)?.title;
    if (!firstDueNotionTitle) throw new Error("expected to find the notion of the rated card");

    await page.getByRole("button", { name: "Quitter" }).click();
    const ratedNotionCard = page.getByTestId("notion-card").filter({ hasText: firstDueNotionTitle });
    await expect(ratedNotionCard.getByRole("button", { name: "Réviser cette notion" })).toBeVisible({ timeout: 10_000 });
    await ratedNotionCard.getByRole("button", { name: "Réviser cette notion" }).click();

    // Rate every card still due for this notion alone (1 to 5 per notion,
    // docs/modules/generation.md) until it has none left — this only
    // touches this notion's cards, proving the notionId filter is wired
    // end to end, not just at the API layer.
    const nothingDueYet = page.getByText("Tout est à jour.");
    const revealButton = page.getByRole("button", { name: "Révéler la réponse" });
    const sessionDone = page.getByText("Tu as terminé cette session.");
    for (let i = 0; i < 5; i += 1) {
      await expect(nothingDueYet.or(revealButton).or(sessionDone)).toBeVisible({ timeout: 10_000 });
      if (await nothingDueYet.isVisible().catch(() => false)) break;
      if (await sessionDone.isVisible().catch(() => false)) break;
      await revealButton.click();
      await page.getByRole("button", { name: "Correct" }).click();
    }

    await expect(nothingDueYet.or(sessionDone)).toBeVisible({ timeout: 10_000 });
  });
});
