import { expect, test } from "@playwright/test";

// docs/UI.md's Aujourd'hui reprise: one card per course (never one row per
// signal), a path to action on every card (Voir le cours / Réviser), and a
// minimal manual todo form now that the CRUD (docs/modules/workspace.md,
// M6 step 1) is actually reachable from the UI.
test.describe("today", () => {
  test("a course with due cards gets one actionable card, review and course navigation both work, and a todo can be added by hand", async ({ page }) => {
    test.setTimeout(90_000); // extra room: extraction, splitting, generation and a review session, all under shared-worker contention
    await page.goto("/");

    await page.getByText("+ Ajouter un cours").click();
    await page.getByLabel("Titre du cours").fill("Cours du jour");
    await page.getByLabel("Photos ou document").setInputFiles({ name: "page.jpg", mimeType: "image/jpeg", buffer: Buffer.from("page") });
    await page.getByRole("button", { name: "Confirmer" }).click();

    const documentCard = page.getByTestId("document-card").filter({ hasText: "Cours du jour" });
    // Generous: the worker process is shared with every other e2e spec's
    // jobs, and under full-suite parallel load this one can sit in the
    // queue behind extraction/split/generation jobs from other specs
    // (same contention e2e/progress.spec.ts's and e2e/todo-photo.spec.ts's
    // own generous timeouts already accommodate).
    await expect(documentCard.getByText("Terminé")).toBeVisible({ timeout: 45_000 });
    await documentCard.getByRole("button", { name: "Voir les notions" }).click();

    const notionCards = page.getByTestId("notion-card");
    await expect(notionCards.first()).toBeVisible({ timeout: 15_000 });
    const notionCount = await notionCards.count();

    await page.getByRole("button", { name: "Créer les fiches" }).click();

    const docsRes = await page.request.get("/api/documents");
    const documents = (await docsRes.json()) as { id: string; title: string }[];
    const documentId = documents.find((d) => d.title === "Cours du jour")?.id;
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

    await page.getByRole("button", { name: "Aujourd'hui" }).click();
    await expect(page.getByRole("heading", { name: "Aujourd'hui" })).toBeVisible();

    // One card for the course, carrying the due count, not a separate row
    // repeated per signal.
    const courseCard = page.getByTestId("course-today-card").filter({ hasText: "Cours du jour" });
    await expect(courseCard).toBeVisible({ timeout: 10_000 });
    await expect(courseCard.getByText(/à revoir aujourd'hui/)).toBeVisible();

    await courseCard.getByRole("button", { name: "Réviser" }).click();
    await expect(page.getByRole("button", { name: "Révéler la réponse" })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Quitter" }).click();

    await page.getByRole("button", { name: "Aujourd'hui" }).click();
    const courseCardAgain = page.getByTestId("course-today-card").filter({ hasText: "Cours du jour" });
    await expect(courseCardAgain).toBeVisible({ timeout: 10_000 });
    await courseCardAgain.getByRole("button", { name: "Voir le cours" }).click();
    await expect(notionCards.first()).toBeVisible({ timeout: 10_000 });

    // No "Retour" on this screen: both homes stay reachable from the header.
    await page.getByRole("button", { name: "Aujourd'hui" }).click();
    await expect(page.getByText("Retour", { exact: true })).toHaveCount(0);

    await page.getByLabel("Nouveau todo").fill("Réviser demain");
    await page.getByRole("button", { name: "Ajouter", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "Réviser demain" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("checkbox", { name: "Réviser demain" })).not.toBeChecked();

    await page.getByRole("button", { name: "Mes cours", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Mes cours" })).toBeVisible();
  });
});
