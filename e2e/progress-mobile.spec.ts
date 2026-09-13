/// <reference lib="dom" />
// No existing e2e spec needed a page.evaluate() callback referencing a
// browser global before e2e/today-mobile.spec.ts's own note on this exact
// workaround (this project's tsconfig.base.json deliberately has no "dom"
// in its lib array) — repeated here rather than shared, since a triple-
// slash reference is file-scoped by design.
import { expect, test, type Page } from "@playwright/test";

// docs/MILESTONES.md's M10 Phase 1 per-screen backlog, Progrès' own entry
// — updated by a real 375px measurement during this pass: every
// Button-based action was already 44px, and the "Tous les cours" row
// (one big button around real content) was already well over 44px. Exactly
// as predicted (CoursePill is duplicated verbatim across Notions/Lecteur/
// Progrès), the course pill carried the same 38px defect. This is this
// screen's own dedicated 375x812 viewport override (docs/UI.md's
// Responsive conventions) for the root padding and pill fixes across all
// four required states (docs/UI.md's Required states).
//
// Loading, error and empty all use page.route() rather than the real
// backend — same reasoning as e2e/today-mobile.spec.ts's own note: the
// shared e2e account accumulates real documents across the whole suite
// (docs/TESTING.md's "one database per run"). Only "ready" needs the real
// backend.
test.describe("Progrès mobile (M10 Phase 1)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  async function scrollWidth(page: Page): Promise<number> {
    return page.evaluate(() => document.documentElement.scrollWidth);
  }

  // GET /api/course-progress carries a query string (today=…,
  // apps/web/src/lib/progress-api.ts) — the same reason e2e/today-mobile.spec.ts's
  // own note gives for /api/today: a bare "$"-anchored end would only match
  // a URL with nothing after "course-progress" and silently never fire.
  const PROGRESS_ROUTE = /\/api\/course-progress(\?|$)/;

  test("loading state: no horizontal overflow", async ({ page }) => {
    await page.goto("/");
    await page.route(PROGRESS_ROUTE, async () => {
      // Deliberately never fulfilled/continued/aborted: the request stays
      // pending, which is exactly the "loading" state to verify.
    });
    await page.getByRole("button", { name: "Progrès", exact: true }).click();
    await page.getByRole("heading", { name: "Progrès" }).waitFor();

    expect(await scrollWidth(page)).toBeLessThanOrEqual(375);
  });

  test("error state: no horizontal overflow", async ({ page }) => {
    await page.goto("/");
    await page.route(PROGRESS_ROUTE, (route) => route.fulfill({ status: 500, body: "" }));
    await page.getByRole("button", { name: "Progrès", exact: true }).click();
    await page.getByText(/impossible de charger ta progression/i).waitFor();

    expect(await scrollWidth(page)).toBeLessThanOrEqual(375);
  });

  test("empty state: no horizontal overflow", async ({ page }) => {
    await page.goto("/");
    await page.route(PROGRESS_ROUTE, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await page.getByRole("button", { name: "Progrès", exact: true }).click();
    await page.getByText(/aucun cours pour l'instant/i).waitFor();

    expect(await scrollWidth(page)).toBeLessThanOrEqual(375);
  });

  test("ready state: no horizontal overflow with a real course, and the course pill reaches 44px", async ({ page }) => {
    test.setTimeout(30_000);
    await page.goto("/");

    await page.getByRole("button", { name: "Mes cours", exact: true }).click();
    await page.getByLabel("Titre du cours").fill("Cours progres mobile");
    await page.getByLabel(/dépose un fichier/i).setInputFiles({ name: "page.jpg", mimeType: "image/jpeg", buffer: Buffer.from("page") });
    await page.getByRole("button", { name: "Créer le cours" }).click();
    await page
      .getByTestId("document-card")
      .filter({ hasText: "Cours progres mobile" })
      .getByRole("button", { name: "Lire le cours" })
      .waitFor({ timeout: 15_000 });

    await page.getByRole("button", { name: "Progrès", exact: true }).click();
    await page.getByTestId("progress-detail-card").waitFor({ timeout: 15_000 });

    expect(await scrollWidth(page)).toBeLessThanOrEqual(375);

    // A real, taller box now (min-h-11), not an invisible margin — no
    // adjacency risk to measure, the same reasoning as Notions/Lecteur's
    // own CoursePill note in docs/UI.md.
    const pill = page.getByRole("button", { name: "Cours progres mobile", exact: true });
    const pillBox = await pill.boundingBox();
    if (!pillBox) throw new Error("expected the course pill to report a bounding box");
    expect(pillBox.height).toBeGreaterThanOrEqual(44);
  });
});

// docs/MILESTONES.md's own M10 Phase 1 acceptance text names this
// screen's own pre-existing breakpoint explicitly: "768px is the default
// point to become a row... an earlier one never is (Progression's own
// pre-existing 640px split is the thing actually wrong)". A tablet-width
// viewport between the two (700px) is the only way to actually observe
// the bug this pass fixed: at 375px the layout was always single-column
// regardless of which breakpoint was wrong, and at desktop width both
// breakpoints are already active — 700px is the one width where "switches
// at 640" and "switches at 768" visibly disagree.
test.describe("Progrès tablet-width breakpoint (M10 Phase 1)", () => {
  test.use({ viewport: { width: 700, height: 900 } });

  test("the ring's own row stays stacked (flex-column) at 700px — the two-column split no longer switches on before the 768px mobile/tablet boundary", async ({ page }) => {
    test.setTimeout(30_000);
    await page.goto("/");

    await page.getByRole("button", { name: "Mes cours", exact: true }).click();
    await page.getByLabel("Titre du cours").fill("Cours progres tablette");
    await page.getByLabel(/dépose un fichier/i).setInputFiles({ name: "page.jpg", mimeType: "image/jpeg", buffer: Buffer.from("page") });
    await page.getByRole("button", { name: "Créer le cours" }).click();
    await page
      .getByTestId("document-card")
      .filter({ hasText: "Cours progres tablette" })
      .getByRole("button", { name: "Lire le cours" })
      .waitFor({ timeout: 15_000 });

    await page.getByRole("button", { name: "Progrès", exact: true }).click();
    await page.getByTestId("progress-detail-card").waitFor({ timeout: 15_000 });

    // Not a visibility check on the ring spacer itself: it renders at
    // zero height (an empty div, no explicit height class) even once
    // `display: block` applies, so Playwright's own visible/hidden check
    // — which requires a non-zero rendered box — reports "hidden"
    // regardless of which breakpoint governs it, a false pass that would
    // never have caught the pre-fix `sm:` bug this test exists for. The
    // actual, unambiguous signal is the ring's own row switching to
    // flex-direction: row (ring beside the gauges) only from `md` up —
    // checked directly via computed style on that row's real container,
    // found by walking up from "progress-detail-body" (the gauges'
    // own wrapper, the row's other child besides the ring).
    const rowFlexDirection = await page.evaluate(() => {
      const body = document.querySelector('[data-testid="progress-detail-body"]');
      const row = body?.parentElement;
      return row ? getComputedStyle(row).flexDirection : null;
    });
    expect(rowFlexDirection).toBe("column");
  });
});
