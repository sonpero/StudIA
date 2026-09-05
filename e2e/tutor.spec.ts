import { expect, test } from "@playwright/test";

// docs/MILESTONES.md's M8 acceptance criterion: "ask a question, receive a
// streamed answer with a citation." Reached via the nav's picker
// (docs/UI.md's Tuteur note), not via NotionsScreen's own "Discuter du
// cours": that entry point additionally depends on content's split job
// having finished, which this scenario has no reason to wait on -- the
// picker only needs the document itself done, independent of notions.
test.describe("tutor", () => {
  test("ask a question about a course and get a streamed, grounded answer with a citation", async ({ page }) => {
    test.setTimeout(30_000);
    await page.goto("/");

    await page.getByText("+ Ajouter un cours").click();
    await page.getByLabel("Titre du cours").fill("Cours pour le tuteur");
    await page.getByLabel("Photos ou document").setInputFiles({ name: "page.jpg", mimeType: "image/jpeg", buffer: Buffer.from("page") });
    await page.getByRole("button", { name: "Confirmer" }).click();

    const card = page.getByTestId("document-card").filter({ hasText: "Cours pour le tuteur" });
    await expect(card.getByText("Terminé")).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Tuteur" }).click();
    await expect(page.getByRole("heading", { name: "Tuteur" })).toBeVisible();

    // A single course in the picker for this scenario, so no need to scope
    // by title: the row's own text and its "Discuter" button are siblings
    // inside the card, not nested one under the other.
    await expect(page.getByText("Cours pour le tuteur")).toBeVisible();
    await page.getByRole("button", { name: "Discuter" }).click();

    await expect(page.getByText("Pose ta première question sur ce cours.")).toBeVisible();

    await page.getByPlaceholder("Pose ta question…").fill("Qu'est-ce que la photosynthèse ?");
    await page.getByRole("button", { name: "Envoyer" }).click();

    // The question itself, streamed immediately (not optimistic UI on
    // generated content, just the student's own words).
    await expect(page.getByText("Qu'est-ce que la photosynthèse ?")).toBeVisible();

    // FixtureChatModel's "valid" case (docs/TESTING.md's fixture cases),
    // streamed chunk by chunk and assembled into one bubble.
    await expect(page.getByText("La photosynthèse est le processus par lequel les plantes convertissent la lumière en énergie chimique.")).toBeVisible({
      timeout: 10_000,
    });

    // A citation, the actual cited text from the course's own extracted
    // markdown (FixtureDocumentExtractor's "valid" case), never a
    // model-generated summary of it.
    await expect(page.getByText("Contenu extrait.")).toBeVisible();

    // Never the interruption notice: this run completed normally.
    await expect(page.getByText(/la réponse s'est arrêtée/i)).not.toBeVisible();
  });
});
