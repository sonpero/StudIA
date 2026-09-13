/// <reference lib="dom" />
// No existing e2e spec needed a page.evaluate() callback referencing a
// browser global before e2e/today-mobile.spec.ts's own note on this exact
// workaround (this project's tsconfig.base.json deliberately has no "dom"
// in its lib array) — repeated here rather than shared, since a triple-
// slash reference is file-scoped by design.
import { expect, test, type Page } from "@playwright/test";

// docs/MILESTONES.md's M10 Phase 1 per-screen backlog, Lecteur's own
// entry — updated by a real 375px measurement during this pass: the
// reading-card/study-panel two-column layout already stacks correctly
// below its own `lg` breakpoint (a deliberate, already-documented
// exception, docs/UI.md's Lecteur note) and every Button-based control was
// already 44px — confirmed by measurement, not assumed, before this pass
// touched anything. The one real gap, exactly as docs/MILESTONES.md's own
// Notions entry predicted (CoursePill is duplicated verbatim between the
// two files): the course pill at 38px, no responsive variant. This is
// this screen's own dedicated 375x812 viewport override (docs/UI.md's
// Responsive conventions), covering the root padding fix and the pill
// fix across all four required states (docs/UI.md's Required states).
//
// Loading, error and empty all use page.route() rather than the real
// backend — same reasoning as e2e/today-mobile.spec.ts's own note: the
// shared e2e account accumulates real documents across the whole suite
// (docs/TESTING.md's "one database per run"). Only "ready" needs the real
// backend: it is the one state the pill fix must hold up against a real
// uploaded course, not a hand-built fixture.
test.describe("Lecteur mobile (M10 Phase 1)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  async function scrollWidth(page: Page): Promise<number> {
    return page.evaluate(() => document.documentElement.scrollWidth);
  }

  // GET /api/documents carries no query string — anchored to the end of
  // the path so it never also catches a sub-path.
  const DOCUMENTS_ROUTE = /\/api\/documents$/;

  test("loading state: no horizontal overflow", async ({ page }) => {
    await page.goto("/");
    await page.route(DOCUMENTS_ROUTE, async () => {
      // Deliberately never fulfilled/continued/aborted: the request stays
      // pending, which is exactly the "loading" state to verify.
    });
    await page.getByRole("button", { name: "Lecteur", exact: true }).click();
    await page.getByRole("heading", { name: "Lecteur", exact: true }).waitFor();

    expect(await scrollWidth(page)).toBeLessThanOrEqual(375);
  });

  test("error state: no horizontal overflow", async ({ page }) => {
    await page.goto("/");
    await page.route(DOCUMENTS_ROUTE, (route) => route.fulfill({ status: 500, body: "" }));
    await page.getByRole("button", { name: "Lecteur", exact: true }).click();
    await page.getByText(/impossible de charger tes cours/i).waitFor();

    expect(await scrollWidth(page)).toBeLessThanOrEqual(375);
  });

  test("empty state: no horizontal overflow", async ({ page }) => {
    await page.goto("/");
    await page.route(DOCUMENTS_ROUTE, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await page.getByRole("button", { name: "Lecteur", exact: true }).click();
    await page.getByText(/ajoute un cours dans mes cours pour le lire/i).waitFor();

    expect(await scrollWidth(page)).toBeLessThanOrEqual(375);
  });

  test("ready state: no horizontal overflow with a real course, and the course pill reaches 44px", async ({ page }) => {
    test.setTimeout(30_000);
    await page.goto("/");

    await page.getByRole("button", { name: "Mes cours", exact: true }).click();
    await page.getByLabel("Titre du cours").fill("Cours lecteur mobile");
    await page.getByLabel(/dépose un fichier/i).setInputFiles({ name: "page.jpg", mimeType: "image/jpeg", buffer: Buffer.from("page") });
    await page.getByRole("button", { name: "Créer le cours" }).click();
    await page
      .getByTestId("document-card")
      .filter({ hasText: "Cours lecteur mobile" })
      .getByRole("button", { name: "Lire le cours" })
      .click();

    await page.getByRole("heading", { name: "Lecteur", exact: true }).waitFor({ timeout: 15_000 });
    await page.getByTestId("reader-study-panel").waitFor({ timeout: 15_000 });

    expect(await scrollWidth(page)).toBeLessThanOrEqual(375);

    // A real, taller box now (min-h-11), not an invisible margin — no
    // adjacency risk to measure, the same reasoning as Notions' own
    // CoursePill note in docs/UI.md.
    const pill = page.getByRole("button", { name: "Cours lecteur mobile", exact: true });
    const pillBox = await pill.boundingBox();
    if (!pillBox) throw new Error("expected the course pill to report a bounding box");
    expect(pillBox.height).toBeGreaterThanOrEqual(44);
  });
});
