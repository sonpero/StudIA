import { expect, test } from "@playwright/test";

// docs/MILESTONES.md M4 acceptance: "Playwright: one scenario per activity
// type." Flashcard is already covered end to end by
// generate-and-review.spec.ts; this file covers mcq and open, each with its
// own document generating exactly one type, so a notion's cards stay
// homogeneous and the review flow is unambiguous to drive.
test.describe("activity types", () => {
  test("mcq activity: generate QCM cards, select an option, and see a review outcome", async ({ page }) => {
    test.setTimeout(60_000); // extra room for the generation poll
    await page.goto("/");

    await page.getByText("+ Ajouter un cours").click();
    await page.getByLabel("Titre du cours").fill("Cours QCM");
    await page.getByLabel("Photos ou document").setInputFiles({ name: "page.jpg", mimeType: "image/jpeg", buffer: Buffer.from("page") });
    await page.getByRole("button", { name: "Confirmer" }).click();

    const documentCard = page.getByTestId("document-card").filter({ hasText: "Cours QCM" });
    await expect(documentCard.getByText("Terminé")).toBeVisible({ timeout: 15_000 });
    await documentCard.getByRole("button", { name: "Voir les notions" }).click();

    const notionCards = page.getByTestId("notion-card");
    await expect(notionCards.first()).toBeVisible({ timeout: 15_000 });
    const notionCount = await notionCards.count();

    const docsRes = await page.request.get("/api/documents");
    const documentId = (await docsRes.json() as { id: string; title: string }[]).find((d) => d.title === "Cours QCM")?.id;
    if (!documentId) throw new Error("expected the just-created document to be listed");

    // Only QCM (docs/modules/generation.md's open question — user choice in
    // M4): keeps every notion's cards homogeneously mcq, so the review flow
    // below is unambiguous.
    await page.getByRole("checkbox", { name: "Flashcards" }).uncheck();
    await page.getByRole("checkbox", { name: "QCM" }).check();
    await page.getByRole("button", { name: "Créer les fiches" }).click();

    await expect
      .poll(
        async () => {
          const status = (await (await page.request.get(`/api/documents/${documentId}/generation-status`)).json()) as { done: number; failed: number };
          return status.done + status.failed;
        },
        { timeout: 45_000, message: "waiting for every notion's generate-cards job to finish" },
      )
      .toBe(notionCount);

    await page.getByRole("button", { name: "Réviser", exact: true }).click();

    // The fixture generator (llmAdapter=fixture) produces deterministic mcq
    // cards: "Question N ?" paired with the correct option "Bonne réponse N"
    // — read N off the rendered question so this works regardless of which
    // card the (tied-timestamp) due ordering shows first.
    const questionText = (await page.locator("main p").first().textContent()) ?? "";
    const index = /Question (\d+) \?/.exec(questionText)?.[1] ?? "1";

    await page.getByRole("button", { name: `Bonne réponse ${index}` }).click();
    await expect(page.getByText("Correct.")).toBeVisible();

    await page.getByRole("button", { name: "Continuer" }).click();

    // A review outcome was produced: either the next card, or a terminal
    // screen — either way the rating was submitted and FSRS advanced.
    const nextState = page.getByText("Tu as terminé cette session.").or(page.getByText(/Question \d+ \?/));
    await expect(nextState).toBeVisible({ timeout: 10_000 });
  });

  test("open activity: generate open questions, answer, get graded, and see a review outcome", async ({ page }) => {
    test.setTimeout(60_000); // extra room for the generation poll
    await page.goto("/");

    await page.getByText("+ Ajouter un cours").click();
    await page.getByLabel("Titre du cours").fill("Cours question ouverte");
    await page.getByLabel("Photos ou document").setInputFiles({ name: "page.jpg", mimeType: "image/jpeg", buffer: Buffer.from("page") });
    await page.getByRole("button", { name: "Confirmer" }).click();

    const documentCard = page.getByTestId("document-card").filter({ hasText: "Cours question ouverte" });
    await expect(documentCard.getByText("Terminé")).toBeVisible({ timeout: 15_000 });
    await documentCard.getByRole("button", { name: "Voir les notions" }).click();

    const notionCards = page.getByTestId("notion-card");
    await expect(notionCards.first()).toBeVisible({ timeout: 15_000 });
    const notionCount = await notionCards.count();

    const docsRes = await page.request.get("/api/documents");
    const documentId = (await docsRes.json() as { id: string; title: string }[]).find((d) => d.title === "Cours question ouverte")?.id;
    if (!documentId) throw new Error("expected the just-created document to be listed");

    await page.getByRole("checkbox", { name: "Flashcards" }).uncheck();
    await page.getByRole("checkbox", { name: "Questions ouvertes" }).check();
    await page.getByRole("button", { name: "Créer les fiches" }).click();

    await expect
      .poll(
        async () => {
          const status = (await (await page.request.get(`/api/documents/${documentId}/generation-status`)).json()) as { done: number; failed: number };
          return status.done + status.failed;
        },
        { timeout: 45_000, message: "waiting for every notion's generate-cards job to finish" },
      )
      .toBe(notionCount);

    await page.getByRole("button", { name: "Réviser", exact: true }).click();

    await page.getByLabel("Ta réponse").fill("Une réponse rédigée par l'apprenant.");
    await page.getByRole("button", { name: "Valider ma réponse" }).click();

    // llmAdapter=fixture wires FixtureAnswerGrader("correct") (apps/api/src/
    // review-deps.ts): the grader's own verdict variety is covered at the
    // unit/contract level, this only proves the round trip is wired.
    await expect(page.getByText(/^Correct\./)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Correct" })).toBeVisible();

    await page.getByRole("button", { name: "Correct" }).click();

    const nextState = page.getByText("Tu as terminé cette session.").or(page.getByLabel("Ta réponse"));
    await expect(nextState).toBeVisible({ timeout: 10_000 });
  });
});
