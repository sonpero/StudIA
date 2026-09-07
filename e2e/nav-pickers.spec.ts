import { expect, test } from "@playwright/test";

// docs/MILESTONES.md's M9 acceptance: "Notions and Lecteur are each
// reachable from the nav via their own picker." (docs/UI.md's Navigation
// note — the same dual-entry shape Tuteur already has, e2e/tutor.spec.ts.)
// Existing entry points (a course's own card on Mes cours, NotionsScreen's
// own toolbar for Lecteur) are unchanged and already covered by other specs
// (generate-and-review.spec.ts, App.unit.test.tsx's own fromNotions case) —
// this one is only for the new nav-level picker path.
//
// Both Notions and Lecteur dropped their own separate picker page in later
// redesigns (ignoring docs/UI.md, per the user): the nav's own entry for
// each now shows a pill selector plus a course's own content directly, no
// separate picker page and no "Retour" at all.
test.describe("nav pickers (M9)", () => {
  test("Notions and Lecteur are each reachable directly from the nav, each showing a course's own content directly via its pill selector, no 'Retour'", async ({ page }) => {
    test.setTimeout(30_000);
    await page.goto("/");

    // The app's home is now Aujourd'hui (M9), not Mes cours — UploadCard is
    // always open once there, no "+ Ajouter un cours" toggle to click through.
    await page.getByRole("button", { name: "Mes cours", exact: true }).click();
    await page.getByLabel("Titre du cours").fill("Cours pour les pickers");
    await page.getByLabel(/dépose un fichier/i).setInputFiles({ name: "page.jpg", mimeType: "image/jpeg", buffer: Buffer.from("page") });
    await page.getByRole("button", { name: "Créer le cours" }).click();

    const card = page.getByTestId("document-card").filter({ hasText: "Cours pour les pickers" });
    await expect(card.getByRole("button", { name: "Lire le cours" })).toBeVisible({ timeout: 20_000 });

    // Notions: directly from the nav, its own pill selector picks the course
    // (not a navigation — no "Voir les notions", no separate picker page).
    await page.getByRole("button", { name: "Notions", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Notions" })).toBeVisible();
    await page.getByRole("button", { name: "Cours pour les pickers", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Cours pour les pickers" })).toBeVisible();
    // content splits notions automatically after extraction
    // (docs/modules/content.md); NotionsScreen polls while empty.
    await expect(page.getByTestId("notion-card").first()).toBeVisible({ timeout: 15_000 });
    // No picker page was ever left, so there is nothing to return to.
    await expect(page.getByRole("button", { name: /retour/i })).not.toBeVisible();

    // Lecteur: directly from the nav, the same pill-selector unification
    // (docs/UI.md's Lecteur note) — its own pill picks the course, no
    // separate picker page.
    await page.getByRole("button", { name: "Lecteur", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Lecteur" })).toBeVisible();
    await page.getByRole("button", { name: "Cours pour les pickers", exact: true }).click();
    await expect(page.getByTestId("reader-study-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /retour/i })).not.toBeVisible();
  });
});
