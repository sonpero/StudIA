import { expect, test, type Page } from "@playwright/test";

// docs/MILESTONES.md M4 acceptance: "Playwright: one scenario per activity
// type." Flashcard is already covered end to end by
// generate-and-review.spec.ts; this file covers mcq and open. Since M11
// there is no card-type choice any more: one course-level job creates
// flashcards, MCQ and open questions together, so each scenario answers
// whatever other cards the session shows first until it reaches a card of
// its own type, then exercises that type exactly as before.
const revealButton = (page: Page) => page.getByRole("button", { name: "Révéler la réponse" });
const mcqCorrectOption = (page: Page) => page.getByRole("button", { name: /^Bonne réponse \d+$/ });
const openAnswer = (page: Page) => page.getByLabel("Ta réponse");

async function answerOtherCardsUntil(page: Page, target: "mcq" | "open"): Promise<void> {
  const targetLocator = target === "mcq" ? mcqCorrectOption(page) : openAnswer(page);
  // 10 cards at most for this fixture course (5 flashcards, 3 MCQ, 2 open).
  for (let i = 0; i < 10; i += 1) {
    await expect(revealButton(page).or(mcqCorrectOption(page)).or(openAnswer(page))).toBeVisible({ timeout: 10_000 });
    if (await targetLocator.isVisible()) return;
    if (await revealButton(page).isVisible()) {
      await revealButton(page).click();
      await page.getByRole("button", { name: "Correct" }).click();
    } else if (await mcqCorrectOption(page).isVisible()) {
      await mcqCorrectOption(page).click();
      await page.getByRole("button", { name: "Continuer" }).click();
    } else {
      await openAnswer(page).fill("Une réponse rédigée par l'apprenant.");
      await page.getByRole("button", { name: "Valider ma réponse" }).click();
      await page.getByRole("button", { name: "Correct" }).click();
    }
  }
  throw new Error(`expected to reach a ${target} card within this course's session`);
}
test.describe("activity types", () => {
  test("mcq activity: generate QCM cards, select an option, and see a review outcome", async ({ page }) => {
    test.setTimeout(60_000); // extra room for the generation poll
    await page.goto("/");

    // The app's home is now Aujourd'hui (M9), not Mes cours — UploadCard is
    // always open once there, no "+ Ajouter un cours" toggle to click through.
    await page.getByRole("button", { name: "Mes cours", exact: true }).click();
    await page.getByLabel("Titre du cours").fill("Cours QCM");
    await page.getByLabel(/dépose un fichier/i).setInputFiles({ name: "page.jpg", mimeType: "image/jpeg", buffer: Buffer.from("page") });
    await page.getByRole("button", { name: "Créer le cours" }).click();

    const documentCard = page.getByTestId("document-card").filter({ hasText: "Cours QCM" });
    await expect(documentCard.getByRole("button", { name: "Lire le cours" })).toBeVisible({ timeout: 15_000 });

    // Notions no longer has its own per-card entry point on Mes cours (M9's
    // later redesign): the nav's own "Notions" destination, then this
    // course's own pill, land on its notions directly.
    await page.getByRole("button", { name: "Notions", exact: true }).click();
    await page.getByRole("button", { name: "Cours QCM", exact: true }).click();

    const notionCards = page.getByTestId("notion-card");
    await expect(notionCards.first()).toBeVisible({ timeout: 15_000 });

    const docsRes = await page.request.get("/api/documents");
    const documentId = (await docsRes.json() as { id: string; title: string }[]).find((d) => d.title === "Cours QCM")?.id;
    if (!documentId) throw new Error("expected the just-created document to be listed");

    await page.getByRole("button", { name: "Créer les fiches" }).click();

    await expect
      .poll(
        async () => {
          const status = (await (await page.request.get(`/api/documents/${documentId}/generation-status`)).json()) as { done: number; failed: number };
          return status.done + status.failed;
        },
        { timeout: 45_000, message: "waiting for the course's generate-course-cards job to finish" },
      )
      .toBe(1);

    // The whole-course review entry point (its own "Réviser N fiches"
    // button, distinct from each notion card's own plain "Réviser") — this
    // fixture document has 5 notions (fixture-notion-splitter.ts), so a bare
    // exact "Réviser" match would hit more than one of those instead.
    await page.getByTestId("notions-course-summary").getByRole("button", { name: /^réviser/i }).click();

    await answerOtherCardsUntil(page, "mcq");

    // The fixture key-notion card generator (llmAdapter=fixture) produces
    // deterministic mcq cards: "QCM N ?" paired with the correct option
    // "Bonne réponse N" — read N off the rendered question so this works
    // regardless of which card the (tied-timestamp) due ordering shows first.
    const questionText = (await page.getByText(/^QCM \d+ \?$/).textContent()) ?? "";
    const index = /QCM (\d+) \?/.exec(questionText)?.[1] ?? "1";

    await page.getByRole("button", { name: `Bonne réponse ${index}` }).click();
    await expect(page.getByText("Correct.")).toBeVisible();

    await page.getByRole("button", { name: "Continuer" }).click();

    // A review outcome was produced: either the next card (of any type, the
    // session is mixed now), or a terminal screen — either way the rating
    // was submitted and FSRS advanced.
    await expect(page.getByText(`QCM ${index} ?`, { exact: true })).toHaveCount(0, { timeout: 10_000 });
    const nextState = page
      .getByText("Tu as terminé cette session.")
      .or(revealButton(page))
      .or(mcqCorrectOption(page))
      .or(openAnswer(page));
    await expect(nextState).toBeVisible({ timeout: 10_000 });
  });

  test("open activity: generate open questions, answer, get graded, and see a review outcome", async ({ page }) => {
    test.setTimeout(60_000); // extra room for the generation poll
    await page.goto("/");

    // The app's home is now Aujourd'hui (M9), not Mes cours — UploadCard is
    // always open once there, no "+ Ajouter un cours" toggle to click through.
    await page.getByRole("button", { name: "Mes cours", exact: true }).click();
    await page.getByLabel("Titre du cours").fill("Cours question ouverte");
    await page.getByLabel(/dépose un fichier/i).setInputFiles({ name: "page.jpg", mimeType: "image/jpeg", buffer: Buffer.from("page") });
    await page.getByRole("button", { name: "Créer le cours" }).click();

    const documentCard = page.getByTestId("document-card").filter({ hasText: "Cours question ouverte" });
    await expect(documentCard.getByRole("button", { name: "Lire le cours" })).toBeVisible({ timeout: 15_000 });

    // Notions no longer has its own per-card entry point on Mes cours (M9's
    // later redesign): the nav's own "Notions" destination, then this
    // course's own pill, land on its notions directly.
    await page.getByRole("button", { name: "Notions", exact: true }).click();
    await page.getByRole("button", { name: "Cours question ouverte", exact: true }).click();

    const notionCards = page.getByTestId("notion-card");
    await expect(notionCards.first()).toBeVisible({ timeout: 15_000 });

    const docsRes = await page.request.get("/api/documents");
    const documentId = (await docsRes.json() as { id: string; title: string }[]).find((d) => d.title === "Cours question ouverte")?.id;
    if (!documentId) throw new Error("expected the just-created document to be listed");

    await page.getByRole("button", { name: "Créer les fiches" }).click();

    await expect
      .poll(
        async () => {
          const status = (await (await page.request.get(`/api/documents/${documentId}/generation-status`)).json()) as { done: number; failed: number };
          return status.done + status.failed;
        },
        { timeout: 45_000, message: "waiting for the course's generate-course-cards job to finish" },
      )
      .toBe(1);

    // The whole-course review entry point (its own "Réviser N fiches"
    // button, distinct from each notion card's own plain "Réviser") — this
    // fixture document has 5 notions (fixture-notion-splitter.ts), so a bare
    // exact "Réviser" match would hit more than one of those instead.
    await page.getByTestId("notions-course-summary").getByRole("button", { name: /^réviser/i }).click();

    await answerOtherCardsUntil(page, "open");
    await page.getByLabel("Ta réponse").fill("Une réponse rédigée par l'apprenant.");
    await page.getByRole("button", { name: "Valider ma réponse" }).click();

    // llmAdapter=fixture wires FixtureAnswerGrader("correct") (apps/api/src/
    // review-deps.ts): the grader's own verdict variety is covered at the
    // unit/contract level, this only proves the round trip is wired.
    await expect(page.getByText(/^Correct\./)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Correct" })).toBeVisible();

    await page.getByRole("button", { name: "Correct" }).click();

    // The session is mixed now: the next card can be of any type.
    const nextState = page.getByText("Tu as terminé cette session.").or(page.getByLabel("Ta réponse")).or(revealButton(page)).or(mcqCorrectOption(page));
    await expect(nextState).toBeVisible({ timeout: 10_000 });
  });
});
