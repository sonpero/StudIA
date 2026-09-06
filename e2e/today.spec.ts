import { expect, test } from "@playwright/test";
import { TEST_USERNAME } from "./support/env.js";

// docs/UI.md's Aujourd'hui reprise: one card per course (never one row per
// signal), a single action per card — "Réviser" while cards are due, a
// disabled "Rien à réviser" once none are (M9's later redesign dropped the
// card's second action, "Voir le cours"/navigate-without-reviewing, by
// product decision, not an oversight — Mes cours' own card kept its
// equivalent "Lire le cours") — and a minimal manual todo form now that the
// CRUD (docs/modules/workspace.md, M6 step 1) is actually reachable from
// the UI.
test.describe("today", () => {
  test("a course with due cards gets one actionable card, review works, and a todo can be added by hand", async ({ page }) => {
    test.setTimeout(60_000); // extra room: extraction, splitting, generation and a review session
    await page.goto("/");

    // The app's home is now Aujourd'hui (M9), not Mes cours — UploadCard is
    // always open once there, no "+ Ajouter un cours" toggle to click through.
    await page.getByRole("button", { name: "Mes cours", exact: true }).click();
    await page.getByLabel("Titre du cours").fill("Cours du jour");
    await page.getByLabel(/dépose un fichier/i).setInputFiles({ name: "page.jpg", mimeType: "image/jpeg", buffer: Buffer.from("page") });
    await page.getByRole("button", { name: "Créer le cours" }).click();

    const documentCard = page.getByTestId("document-card").filter({ hasText: "Cours du jour" });
    await expect(documentCard.getByRole("button", { name: "Lire le cours" })).toBeVisible({ timeout: 15_000 });

    // Notions no longer has its own per-card entry point on Mes cours (M9's
    // later redesign): the nav's own "Notions" destination, then this
    // course's own pill, land on its notions directly.
    await page.getByRole("button", { name: "Notions", exact: true }).click();
    await page.getByRole("button", { name: "Cours du jour", exact: true }).click();

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
    // Aujourd'hui's own heading is the greeting now (M9's redesign), not the
    // page name — the nav item's own active state already covers that.
    await expect(page.getByRole("heading", { name: `Bonjour, ${TEST_USERNAME}` })).toBeVisible();

    // One card for the course, carrying the due count, not a separate row
    // repeated per signal.
    const courseCard = page.getByTestId("course-today-card").filter({ hasText: "Cours du jour" });
    await expect(courseCard).toBeVisible({ timeout: 10_000 });
    await expect(courseCard.getByText(/fiches? à revoir/)).toBeVisible();

    // Proves the card's own "Réviser" wires to a real review session
    // (rating behaviour itself — due dates moving, counts dropping — is
    // already covered end to end by generate-and-review.spec.ts and
    // progress.spec.ts); quitting without rating is enough here.
    await courseCard.getByRole("button", { name: "Réviser" }).click();
    await expect(page.getByRole("button", { name: "Révéler la réponse" })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Quitter" }).click();

    // No "Retour" on this screen: both homes stay reachable from the header.
    await page.getByRole("button", { name: "Aujourd'hui" }).click();
    await expect(page.getByText("Retour", { exact: true })).toHaveCount(0);

    // The add-todo form is collapsed by default behind its own trigger
    // (docs/UI.md) — a permanently open form was, on its own, wider and
    // taller than the list it sat below.
    await page.getByRole("button", { name: "Ajouter un todo" }).click();
    await page.getByLabel("Nouveau todo").fill("Réviser demain");
    await page.getByRole("button", { name: "Ajouter", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "Réviser demain" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("checkbox", { name: "Réviser demain" })).not.toBeChecked();

    await page.getByRole("button", { name: "Mes cours", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Mes cours" })).toBeVisible();
  });
});
