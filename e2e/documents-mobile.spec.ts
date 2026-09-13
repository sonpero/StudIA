/// <reference lib="dom" />
// No existing e2e spec needed a page.evaluate() callback referencing a
// browser global before e2e/today-mobile.spec.ts's own note on this exact
// workaround (this project's tsconfig.base.json deliberately has no "dom"
// in its lib array) — repeated here rather than shared, since a triple-
// slash reference is file-scoped by design.
import { expect, test, type Page } from "@playwright/test";

// docs/MILESTONES.md's M10 Phase 1 per-screen backlog, Mes cours' own
// entry: the fixed w-[320px] upload panel never stacked and overflowed
// 375px (the pre-existing bug e2e/mobile-shell.spec.ts's own shell pass
// already found and deliberately scoped around), and the per-document
// delete button (h-8 w-8, 32px) had no 44px hit zone at any breakpoint.
// This is this screen's own dedicated 375x812 viewport override
// (docs/UI.md's Responsive conventions: a per-spec override, never a
// second playwright.config.ts project), covering both fixes across all
// four required states (docs/UI.md's Required states).
//
// Loading, error and empty all use page.route() rather than the real
// backend — same reasoning as e2e/today-mobile.spec.ts's own note: the
// shared e2e account accumulates real documents across the whole suite
// (docs/TESTING.md's "one database per run"), so a plain page.goto()
// cannot assume the account is ever "empty" again, or answer slowly enough
// to observe "loading", once other specs have already run. Only "ready"
// needs the real backend: it is the one state this pass's own fix must
// hold up against a real uploaded course, not a hand-built fixture.
test.describe("Mes cours mobile (M10 Phase 1)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  async function scrollWidth(page: Page): Promise<number> {
    return page.evaluate(() => document.documentElement.scrollWidth);
  }

  // GET /api/documents carries no query string, unlike GET /api/today —
  // still anchored to the end of the path (not a bare substring match) so
  // it never also catches a sub-path like DELETE /api/documents/d1.
  const DOCUMENTS_ROUTE = /\/api\/documents$/;

  test("loading state: no horizontal overflow", async ({ page }) => {
    await page.goto("/");
    await page.route(DOCUMENTS_ROUTE, async () => {
      // Deliberately never fulfilled/continued/aborted: the request stays
      // pending, which is exactly the "loading" state to verify.
    });
    await page.getByRole("button", { name: "Mes cours", exact: true }).click();
    // The upload panel is not part of what's loading (docs/UI.md's Mes
    // cours note) — the same real signal DocumentsScreen.unit.test.tsx
    // already uses to prove the screen mounted while the list is pending.
    await page.getByLabel("Titre du cours").waitFor();

    expect(await scrollWidth(page)).toBeLessThanOrEqual(375);
  });

  test("error state: no horizontal overflow", async ({ page }) => {
    await page.goto("/");
    await page.route(DOCUMENTS_ROUTE, (route) => route.fulfill({ status: 500, body: "" }));
    await page.getByRole("button", { name: "Mes cours", exact: true }).click();
    await page.getByText(/impossible de charger tes cours/i).waitFor();

    expect(await scrollWidth(page)).toBeLessThanOrEqual(375);
  });

  test("empty state: no horizontal overflow", async ({ page }) => {
    await page.goto("/");
    await page.route(DOCUMENTS_ROUTE, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await page.getByRole("button", { name: "Mes cours", exact: true }).click();
    await page.getByText(/prends ton cours en photo pour commencer/i).waitFor();

    expect(await scrollWidth(page)).toBeLessThanOrEqual(375);
  });

  test("ready state: no horizontal overflow with a real course card, and a click just outside the delete button's own box still deletes it", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Mes cours", exact: true }).click();
    await page.getByLabel("Titre du cours").fill("Chapitre mobile");
    await page.getByLabel(/dépose un fichier/i).setInputFiles({ name: "page.jpg", mimeType: "image/jpeg", buffer: Buffer.from("page") });
    await page.getByRole("button", { name: "Créer le cours" }).click();

    const documentCard = page.getByTestId("document-card").filter({ hasText: "Chapitre mobile" });
    await expect(documentCard).toBeVisible({ timeout: 15_000 });

    expect(await scrollWidth(page)).toBeLessThanOrEqual(375);

    // Proves the enlarged zone is real, not just present in the markup: a
    // click just outside the delete button's own 32px box on both axes
    // (still inside its 44px pseudo-element) deletes the course. The
    // available margin is (44 - 32) / 2 = 6px per side — narrower than the
    // checkbox's own 13px in e2e/today-mobile.spec.ts (18px real box) —
    // so 4px stays safely inside it where that spec's own 10px would not.
    // page.mouse.click() at a raw page coordinate, not locator.click({
    // position }): the same reasoning as that spec's own checkbox test —
    // not strictly needed here (this button hosts its own pseudo directly,
    // no wrapping element to complicate Playwright's own actionability
    // check), but kept identical for one pattern across both specs.
    const deleteButton = documentCard.getByRole("button", { name: /supprimer.*chapitre mobile/i });
    const deleteBox = await deleteButton.boundingBox();
    if (!deleteBox) throw new Error("expected the delete button to report a bounding box");
    await page.mouse.click(deleteBox.x - 4, deleteBox.y - 4);

    await expect(documentCard).toHaveCount(0);
  });
});
