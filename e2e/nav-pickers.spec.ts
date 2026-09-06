import { expect, test } from "@playwright/test";

// docs/MILESTONES.md's M9 acceptance: "Notions and Lecteur are each
// reachable from the nav via their own picker." (docs/UI.md's Navigation
// note — the same dual-entry shape Tuteur already has, e2e/tutor.spec.ts.)
// Existing entry points (a course's own card on Mes cours, NotionsScreen's
// own toolbar for Lecteur) are unchanged and already covered by other specs
// (generate-and-review.spec.ts, App.unit.test.tsx's own fromNotions case) —
// this one is only for the new nav-level picker path.
//
// Notions dropped its own separate picker page in its later redesign
// (ignoring docs/UI.md, per the user): the nav's own "Notions" entry now
// shows a pill selector plus a course's notions directly, no "Voir les
// notions" click and no "Retour" at all — Lecteur is untouched, still the
// original two-step picker → course flow this spec's own title describes.
test.describe("nav pickers (M9)", () => {
  test("Notions and Lecteur are each reachable directly from the nav; Notions shows a course's own notions directly via its pill selector, Lecteur still via its picker with 'Retour' back to it", async ({ page }) => {
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

    // Every spec in a full local run shares one e2e account and its
    // "Mes cours" (docs/TESTING.md's "one database per run"), so by the
    // time this spec runs, other specs' own courses already exist too —
    // scoped by title, not a bare role query, the same way
    // upload-document.spec.ts already scopes its own document-card.
    const pickerRow = page.getByTestId("course-picker-row").filter({ hasText: "Cours pour les pickers" });

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

    // Lecteur: directly from the nav, no course chosen yet — its own
    // picker, unchanged.
    await page.getByRole("button", { name: "Lecteur", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Lecteur" })).toBeVisible();
    await pickerRow.getByRole("button", { name: "Lire le cours" }).click();
    await expect(page.getByRole("heading", { name: "Lecture" })).toBeVisible();

    await page.getByRole("button", { name: "Retour" }).click();
    await expect(page.getByRole("heading", { name: "Lecteur" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mes cours" })).not.toBeVisible();
  });
});
