/// <reference lib="dom" />
// No existing e2e spec needed a page.evaluate() callback referencing a
// browser global before e2e/today-mobile.spec.ts's own note on this exact
// workaround (this project's tsconfig.base.json deliberately has no "dom"
// in its lib array) — repeated here rather than shared, since a triple-
// slash reference is file-scoped by design.
import { expect, test, type Page } from "@playwright/test";

// docs/MILESTONES.md's M10 Phase 1 per-screen backlog, Agenda's own entry
// — updated by a real 375px measurement during this pass: day cells were
// 36px wide (min-h-14 already gave a compliant 56px height, but width came
// from an unconstrained 7-column grid, exactly the "real candidate" the
// original source-read audit flagged but never measured), and the month-nav
// buttons were 42px wide, 2px short. This is this screen's own dedicated
// 375x812 viewport override (docs/UI.md's Responsive conventions) for the
// root padding and both touch-target fixes.
//
// Only three states, not four: unlike Notions/Lecteur/Progrès, this screen
// has no distinct "empty" branch — an empty month is a normal, always-
// present grid with nothing in it (docs/UI.md's Agenda note: "Prochaines
// échéances"' own empty sentence already covers that sub-case), so "ready"
// alone already covers what an empty-data render looks like. No course
// needs creating for it either: the grid and nav render identically
// regardless of whether the account has any courses or deadlines, so this
// spec never touches the shared e2e account's own accumulated data
// (docs/TESTING.md's "one database per run") at all.
test.describe("Agenda mobile (M10 Phase 1)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  async function scrollWidth(page: Page): Promise<number> {
    return page.evaluate(() => document.documentElement.scrollWidth);
  }

  // GET /api/calendar carries a query string (start=…&end=…,
  // apps/web/src/lib/calendar-api.ts) — the same reason e2e/today-mobile.spec.ts's
  // own note gives for /api/today: a bare "$"-anchored end would only
  // match a URL with nothing after "calendar" and silently never fire.
  const CALENDAR_ROUTE = /\/api\/calendar(\?|$)/;

  test("loading state: no horizontal overflow", async ({ page }) => {
    await page.goto("/");
    await page.route(CALENDAR_ROUTE, async () => {
      // Deliberately never fulfilled/continued/aborted: the request stays
      // pending, which is exactly the "loading" state to verify.
    });
    await page.getByRole("button", { name: "Agenda", exact: true }).click();
    await page.getByTestId("calendar-grid-skeleton").waitFor();

    expect(await scrollWidth(page)).toBeLessThanOrEqual(375);
  });

  test("error state: no horizontal overflow", async ({ page }) => {
    await page.goto("/");
    await page.route(CALENDAR_ROUTE, (route) => route.fulfill({ status: 500, body: "" }));
    await page.getByRole("button", { name: "Agenda", exact: true }).click();
    await page.getByText(/impossible de charger le calendrier/i).waitFor();

    expect(await scrollWidth(page)).toBeLessThanOrEqual(375);
  });

  test("ready state: no horizontal overflow, day cells and month-nav buttons both reach 44px", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Agenda", exact: true }).click();
    await page.getByTestId("calendar-grid").waitFor({ timeout: 15_000 });

    expect(await scrollWidth(page)).toBeLessThanOrEqual(375);

    // A real, wider box now (min-w-11 on the nav buttons, a dropped gap on
    // the grid itself), not an invisible margin — the same reasoning as
    // Notions/Lecteur/Progrès' own CoursePill fix: real boxes with real
    // spacing between them can never overlap a neighbour, so no adjacency
    // measurement is needed here the way Aujourd'hui's checkbox/delete
    // pair needed one.
    const dayCells = page.locator('[data-testid^="calendar-day-"]');
    const firstDayCellBox = await dayCells.first().boundingBox();
    if (!firstDayCellBox) throw new Error("expected the first day cell to report a bounding box");
    expect(firstDayCellBox.width).toBeGreaterThanOrEqual(44);

    const prevBox = await page.getByRole("button", { name: "Mois précédent" }).boundingBox();
    const nextBox = await page.getByRole("button", { name: "Mois suivant" }).boundingBox();
    if (!prevBox || !nextBox) throw new Error("expected both month-nav buttons to report a bounding box");
    expect(prevBox.width).toBeGreaterThanOrEqual(44);
    expect(nextBox.width).toBeGreaterThanOrEqual(44);
  });
});
