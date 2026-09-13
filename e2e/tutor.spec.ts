import { expect, test } from "@playwright/test";

// docs/MILESTONES.md's M8 acceptance criterion: "ask a question, receive a
// streamed answer with a citation." Reached via the nav's own pill selector
// (docs/UI.md's Tuteur note, redesigned in a later M9 pass), not via
// NotionsScreen's own "Discuter du cours": that entry point additionally
// depends on content's split job having finished, which this scenario has
// no reason to wait on -- the nav entry only needs the document itself
// done, independent of notions.
test.describe("tutor", () => {
  test("ask a question about a course and get a streamed, grounded answer with a citation", async ({ page }) => {
    test.setTimeout(30_000);
    await page.goto("/");

    // The app's home is now Aujourd'hui (M9), not Mes cours — UploadCard is
    // always open once there, no "+ Ajouter un cours" toggle to click through.
    await page.getByRole("button", { name: "Mes cours", exact: true }).click();
    await page.getByLabel("Titre du cours").fill("Cours pour le tuteur");
    await page.getByLabel(/dépose un fichier/i).setInputFiles({ name: "page.jpg", mimeType: "image/jpeg", buffer: Buffer.from("page") });
    await page.getByRole("button", { name: "Créer le cours" }).click();

    const card = page.getByTestId("document-card").filter({ hasText: "Cours pour le tuteur" });
    await expect(card.getByRole("button", { name: "Lire le cours" })).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Tuteur", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Tuteur" })).toBeVisible();

    // Every spec in a full local run shares one e2e account and its
    // "Mes cours" (docs/TESTING.md's "one database per run"), so by the
    // time this spec runs, other specs' own courses are already in the
    // pill row too — scoped by exact name, not a bare role query, the same
    // way nav-pickers.spec.ts already scopes its own pill clicks.
    await page.getByRole("button", { name: "Cours pour le tuteur", exact: true }).click();

    await expect(page.getByTestId("tutor-greeting")).toBeVisible();

    await page.getByRole("textbox").fill("Qu'est-ce que la photosynthèse ?");
    await page.getByRole("button", { name: "Envoyer" }).click();

    // The question itself, streamed immediately (not optimistic UI on
    // generated content, just the student's own words).
    await expect(page.getByText("Qu'est-ce que la photosynthèse ?")).toBeVisible();

    // FixtureChatModel's "valid" case (docs/TESTING.md's fixture cases),
    // streamed chunk by chunk and assembled into one bubble.
    await expect(page.getByText("La photosynthèse est le processus par lequel les plantes convertissent la lumière en énergie chimique.")).toBeVisible({
      timeout: 10_000,
    });

    // Citations are collapsed by default, per message (commit 0e0255e) —
    // expand them before looking for the cited text below.
    await page.getByRole("button", { name: /voir les sources/i }).click();

    // A citation, the actual cited text from the course's own extracted
    // markdown (FixtureDocumentExtractor's "valid" case), never a
    // model-generated summary of it.
    await expect(page.getByText("Contenu extrait.")).toBeVisible();

    // Never the interruption notice: this run completed normally.
    await expect(page.getByText(/la réponse s'est arrêtée/i)).not.toBeVisible();
  });
});
