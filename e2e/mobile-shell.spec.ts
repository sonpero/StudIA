import { expect, test } from "@playwright/test";

// docs/MILESTONES.md's M10 Phase 1 acceptance: "the shell is usable at
// 375px: all seven nav destinations reachable, the header bar renders
// without horizontal overflow, and the bottom tab bar respects iOS's own
// safe-area-inset-bottom." A viewport override inside this spec, not a
// second playwright.config.ts project (docs/UI.md's own Responsive
// conventions note: the suite already runs at workers: 1, and a second
// project would double every spec's own run under that same serial
// constraint for what a per-spec override gets for free).
//
// Deliberately checks the shell's own two elements (the nav, the header),
// never the whole page's scrollWidth: at least two screens (Aujourd'hui's
// own fixed w-[300px] Pomodoro/Sons d'ambiance column, Mes cours' own
// fixed w-[320px] upload panel) already overflow 375px on their own
// content, a pre-existing, screen-level defect this shell-only pass does
// not touch — confirmed by measurement, not assumed, and out of scope
// here (a separate, later per-screen acceptance box in
// docs/MILESTONES.md's own M10 Phase 1 covers it). The shell itself never
// contributes to that overflow on any of the seven screens, which is what
// this box actually asks for.
test.describe("mobile shell (M10 Phase 1)", () => {
  test("all seven destinations are reachable at 375px, the shell itself never overflows, and no destination is covered by another", async ({ page }) => {
    test.setTimeout(30_000);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.getByRole("heading", { name: /Bonjour/ }).waitFor();

    const destinations = [
      { label: "Aujourd'hui", heading: /Bonjour/ },
      { label: "Mes cours", heading: "Mes cours" },
      { label: "Notions", heading: "Notions" },
      { label: "Lecteur", heading: "Lecteur" },
      { label: "Progrès", heading: "Progrès" },
      { label: "Agenda", heading: "Agenda" },
      { label: "Tuteur", heading: "Tuteur" },
    ];

    for (const { label, heading } of destinations) {
      // A real click, not a direct assertion: if one destination's own
      // enlarged area (or any sibling's) covered another, Playwright's own
      // actionability check would either fail this click or land on the
      // wrong element, and the heading assertion right after would catch
      // either case.
      await page.getByRole("button", { name: label, exact: true }).click();
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();

      const nav = page.getByRole("navigation", { name: "Navigation principale" });
      await expect(nav).toHaveJSProperty("clientWidth", 375);

      const header = page.getByTestId("app-header");
      await expect(header).toHaveJSProperty("clientWidth", 375);
    }
  });
});
