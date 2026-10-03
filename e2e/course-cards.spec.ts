import { expect, test } from "@playwright/test";

// docs/MILESTONES.md M11 acceptance: "Playwright: create the cards of a
// course from Notions, then review one." One course-level job
// (generate-course-cards) creates every card type at once from the course's
// key notions (docs/reports/notions-cles-conception.md): no type choice, no
// per-notion job, and the trigger disappears for good once the course has
// cards — an existing course is never regenerated.
//
// The course title deliberately names no screen: the e2e account is shared
// across the whole suite, and a title like "Notions …" would collide with
// the nav's own exact-name buttons.
test.describe("course cards (M11)", () => {
  test("create the cards of a course from Notions with one trigger, then review one", async ({ page }) => {
    test.setTimeout(60_000); // extra room for the generation poll
    await page.goto("/");

    await page.getByRole("button", { name: "Mes cours", exact: true }).click();
    await page.getByLabel("Titre du cours").fill("Cours de botanique");
    await page.getByLabel(/dépose un fichier/i).setInputFiles({ name: "page.jpg", mimeType: "image/jpeg", buffer: Buffer.from("page") });
    await page.getByRole("button", { name: "Créer le cours" }).click();

    const documentCard = page.getByTestId("document-card").filter({ hasText: "Cours de botanique" });
    await expect(documentCard.getByRole("button", { name: "Lire le cours" })).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Notions", exact: true }).click();
    await page.getByRole("button", { name: "Cours de botanique", exact: true }).click();
    await expect(page.getByTestId("notions-course-summary").filter({ hasText: "Cours de botanique" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("notion-card").first()).toBeVisible({ timeout: 15_000 });

    const docsRes = await page.request.get("/api/documents");
    const documentId = ((await docsRes.json()) as { id: string; title: string }[]).find((d) => d.title === "Cours de botanique")?.id;
    if (!documentId) throw new Error("expected the just-created document to be listed");

    // No card-type choice any more: the course's key notions decide the mix.
    await expect(page.getByRole("checkbox")).toHaveCount(0);

    const trigger = page.getByRole("button", { name: "Créer les fiches" });
    await trigger.click();

    // One course-level job: generation-status reports it alone (total 1),
    // done once it has written every card.
    await expect
      .poll(
        async () => {
          const status = (await (await page.request.get(`/api/documents/${documentId}/generation-status`)).json()) as { done: number; total: number; failed: number };
          return status;
        },
        { timeout: 45_000, message: "waiting for the course's generate-course-cards job to finish" },
      )
      .toEqual({ done: 1, total: 1, failed: 0 });

    // The course now has cards: no trigger of any kind, and no "Régénérer".
    await expect(trigger).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByRole("button", { name: /régénérer/i })).toHaveCount(0);

    await page.getByTestId("notions-course-summary").getByRole("button", { name: /^réviser/i }).click();

    // Mixed session (flashcards, MCQ and open questions together): answer
    // whichever type the due ordering shows first. Fixture texts:
    // flashcard "Question N ?", MCQ correct option "Bonne réponse N", open
    // question "Question ouverte N ?" (packages/core/src/generation/infra's
    // fixture key-notion card generator).
    const reveal = page.getByRole("button", { name: "Révéler la réponse" });
    const mcqCorrect = page.getByRole("button", { name: /^Bonne réponse \d+$/ });
    const openAnswer = page.getByLabel("Ta réponse");
    await expect(reveal.or(mcqCorrect).or(openAnswer)).toBeVisible({ timeout: 10_000 });

    if (await reveal.isVisible()) {
      await reveal.click();
      await page.getByRole("button", { name: "Correct" }).click();
    } else if (await mcqCorrect.isVisible()) {
      await mcqCorrect.click();
      await page.getByRole("button", { name: "Continuer" }).click();
    } else {
      await openAnswer.fill("Une réponse rédigée par l'apprenant.");
      await page.getByRole("button", { name: "Valider ma réponse" }).click();
      await page.getByRole("button", { name: "Correct" }).click();
    }

    // A review outcome: the rating was accepted and the session moved on —
    // either the next card or the end of the session.
    const nextState = page
      .getByText("Tu as terminé cette session.")
      .or(page.getByRole("button", { name: "Révéler la réponse" }))
      .or(page.getByRole("button", { name: /^Bonne réponse \d+$/ }))
      .or(page.getByLabel("Ta réponse"));
    await expect(nextState).toBeVisible({ timeout: 10_000 });

    // Leaving the session and coming back keeps the trigger gone (the nav
    // stays reachable during a review, docs/UI.md's Révision note).
    await page.getByRole("button", { name: "Notions", exact: true }).click();
    await page.getByRole("button", { name: "Cours de botanique", exact: true }).click();
    await expect(page.getByTestId("notion-card").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Créer les fiches" })).toHaveCount(0);
  });
});
