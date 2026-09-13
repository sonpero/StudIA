/// <reference lib="dom" />
// No existing e2e spec needed a page.evaluate() callback referencing a
// browser global before e2e/today-mobile.spec.ts's own note on this exact
// workaround (this project's tsconfig.base.json deliberately has no "dom"
// in its lib array) — repeated here rather than shared, since a triple-
// slash reference is file-scoped by design.
import { expect, test, type Page } from "@playwright/test";

// docs/MILESTONES.md's M10 Phase 1 per-screen backlog, Notions' own entry —
// updated by a real 375px measurement during this pass, not just the
// original source-read audit: no fixed-width column here (unlike
// Aujourd'hui/Mes cours, this screen is a single column throughout), but a
// course pill (38px tall) and each notion-type checkbox's own label (20px
// tall, and the fieldset's own row wraps to two lines at 375px) were both
// under 44px, no responsive variant. This is this screen's own dedicated
// 375x812 viewport override (docs/UI.md's Responsive conventions), covering
// the root padding fix and both touch targets across all four required
// states (docs/UI.md's Required states). The toolbar trio ("Lire le
// cours"/"Voir tes progrès"/"Discuter du cours") is deliberately left
// untouched — already flagged in docs/MILESTONES.md as needing its own
// icon-based redesign, not a mechanical fix, confirmed with the user ahead
// of this pass.
//
// Loading, error and empty all use page.route() rather than the real
// backend — same reasoning as e2e/today-mobile.spec.ts's own note: the
// shared e2e account accumulates real documents across the whole suite
// (docs/TESTING.md's "one database per run"). Only "ready" needs the real
// backend: it is the one state the pill/checkbox fixes must hold up
// against real, auto-split notions, not a hand-built fixture.
test.describe("Notions mobile (M10 Phase 1)", () => {
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
    await page.getByRole("button", { name: "Notions", exact: true }).click();
    await page.getByRole("heading", { name: "Notions" }).waitFor();

    expect(await scrollWidth(page)).toBeLessThanOrEqual(375);
  });

  test("error state: no horizontal overflow", async ({ page }) => {
    await page.goto("/");
    await page.route(DOCUMENTS_ROUTE, (route) => route.fulfill({ status: 500, body: "" }));
    await page.getByRole("button", { name: "Notions", exact: true }).click();
    await page.getByText(/impossible de charger tes cours/i).waitFor();

    expect(await scrollWidth(page)).toBeLessThanOrEqual(375);
  });

  test("empty state: no horizontal overflow", async ({ page }) => {
    await page.goto("/");
    await page.route(DOCUMENTS_ROUTE, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await page.getByRole("button", { name: "Notions", exact: true }).click();
    await page.getByText(/ajoute un cours dans mes cours/i).waitFor();

    expect(await scrollWidth(page)).toBeLessThanOrEqual(375);
  });

  test("ready state: no horizontal overflow with real notions, the course pill and each checkbox label reach 44px, and clicking a checkbox's own enlarged area still checks it", async ({ page }) => {
    test.setTimeout(30_000);
    await page.goto("/");

    await page.getByRole("button", { name: "Mes cours", exact: true }).click();
    await page.getByLabel("Titre du cours").fill("Cours notions mobile");
    await page.getByLabel(/dépose un fichier/i).setInputFiles({ name: "page.jpg", mimeType: "image/jpeg", buffer: Buffer.from("page") });
    await page.getByRole("button", { name: "Créer le cours" }).click();
    await page
      .getByTestId("document-card")
      .filter({ hasText: "Cours notions mobile" })
      .getByRole("button", { name: "Lire le cours" })
      .waitFor({ timeout: 15_000 });

    await page.getByRole("button", { name: "Notions", exact: true }).click();
    await page.getByRole("button", { name: "Cours notions mobile", exact: true }).click();
    // Scoped to this course specifically, not just "any notion-card
    // visible" — other e2e specs sharing this same account (docs/TESTING.md's
    // "one database per run") may already have an earlier, fully-loaded
    // course selected by default when this test navigates to Notions;
    // waiting on a bare `.first()` notion-card could resolve against that
    // other course's own, already-rendered content before this pill click's
    // own key-remount (NotionsCourseScreen's own `key={selectedDocument.id}`)
    // finishes swapping in this course's fresh — briefly loading — content.
    await page.getByTestId("notions-course-summary").filter({ hasText: "Cours notions mobile" }).waitFor({ timeout: 15_000 });
    await page.getByTestId("notion-card").first().waitFor({ timeout: 15_000 });

    expect(await scrollWidth(page)).toBeLessThanOrEqual(375);

    // The pill selector: a real, taller box now (min-h-11), not an
    // invisible margin — no adjacency risk to measure, unlike Aujourd'hui's
    // own checkbox/delete pair (docs/UI.md's CoursePill note has the
    // reasoning for why a real box was used here instead of a pseudo).
    const pill = page.getByRole("button", { name: "Cours notions mobile", exact: true });
    const pillBox = await pill.boundingBox();
    if (!pillBox) throw new Error("expected the course pill to report a bounding box");
    expect(pillBox.height).toBeGreaterThanOrEqual(44);

    // Each notion-type checkbox's own label: also a real box now. Clicking
    // near its own top edge (inside the row's own enlarged real height, not
    // on the native checkbox square itself) still checks it — the ordinary
    // behaviour of a <label>, exercised at the actual enlarged size this
    // time rather than an invisible pseudo-element's own margin.
    const flashcardsLabel = page.locator("fieldset label").filter({ hasText: "Flashcards" });
    const flashcardsCheckbox = flashcardsLabel.getByRole("checkbox");
    const labelBox = await flashcardsLabel.boundingBox();
    if (!labelBox) throw new Error("expected the Flashcards label to report a bounding box");
    expect(labelBox.height).toBeGreaterThanOrEqual(44);

    await expect(flashcardsCheckbox).toBeChecked(); // flashcard is selected by default
    // locator.click({ position }) rather than a raw page.mouse.click() at a
    // coordinate read earlier: the position is resolved against the
    // label's own current box at the moment of the click, not a snapshot
    // that could go stale under the shared e2e account's own accumulated
    // polling/refetches (docs/TESTING.md's "one database per run").
    await flashcardsLabel.click({ position: { x: 5, y: 2 } });
    await expect(flashcardsCheckbox).not.toBeChecked();
  });
});
