import { expect, test } from "@playwright/test";

// docs/MILESTONES.md's M9 acceptance: "Notions and Lecteur are each
// reachable from the nav via their own picker." (docs/UI.md's Navigation
// note — the same dual-entry shape Tuteur already has, e2e/tutor.spec.ts.)
// Existing entry points (a course's own card on Mes cours, NotionsScreen's
// own toolbar for Lecteur) are unchanged and already covered by other specs
// (generate-and-review.spec.ts, App.unit.test.tsx's own fromNotions case) —
// this one is only for the new nav-level picker path.
test.describe("nav pickers (M9)", () => {
  test("Notions and Lecteur are each reachable directly from the nav, and 'Retour' from a course reached that way returns to the picker", async ({ page }) => {
    test.setTimeout(30_000);
    await page.goto("/");

    await page.getByText("+ Ajouter un cours").click();
    await page.getByLabel("Titre du cours").fill("Cours pour les pickers");
    await page.getByLabel("Photos ou document").setInputFiles({ name: "page.jpg", mimeType: "image/jpeg", buffer: Buffer.from("page") });
    await page.getByRole("button", { name: "Confirmer" }).click();

    const card = page.getByTestId("document-card").filter({ hasText: "Cours pour les pickers" });
    await expect(card.getByText("Terminé")).toBeVisible({ timeout: 20_000 });

    // Every spec in a full local run shares one e2e account and its
    // "Mes cours" (docs/TESTING.md's "one database per run"), so by the
    // time this spec runs, other specs' own courses are already in the
    // picker's list too — scoped by title, not a bare role query, the same
    // way upload-document.spec.ts already scopes its own document-card.
    const pickerRow = page.getByTestId("course-picker-row").filter({ hasText: "Cours pour les pickers" });

    // Notions: directly from the nav, no course chosen yet.
    await page.getByRole("button", { name: "Notions", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Notions" })).toBeVisible();
    await pickerRow.getByRole("button", { name: "Voir les notions" }).click();
    await expect(page.getByRole("heading", { name: "Notions du cours" })).toBeVisible();
    // content splits notions automatically after extraction
    // (docs/modules/content.md); NotionsScreen polls while empty.
    await expect(page.getByTestId("notion-card").first()).toBeVisible({ timeout: 15_000 });

    // fromPicker: "Retour", not "Retour à mes cours", back to the picker.
    await page.getByRole("button", { name: "Retour" }).click();
    await expect(page.getByRole("heading", { name: "Notions" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mes cours" })).not.toBeVisible();

    // Lecteur: directly from the nav, no course chosen yet.
    await page.getByRole("button", { name: "Lecteur", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Lecteur" })).toBeVisible();
    await pickerRow.getByRole("button", { name: "Lire le cours" }).click();
    await expect(page.getByRole("heading", { name: "Lecture" })).toBeVisible();

    await page.getByRole("button", { name: "Retour" }).click();
    await expect(page.getByRole("heading", { name: "Lecteur" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mes cours" })).not.toBeVisible();
  });
});
