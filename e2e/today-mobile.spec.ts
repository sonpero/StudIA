/// <reference lib="dom" />
// No existing e2e spec has needed a page.evaluate() callback referencing a
// browser global before — this project's own tsconfig.base.json deliberately
// has no "dom" in its lib array (e2e code runs in Node; the browser-side
// callback body is only ever serialised and sent over, never itself run by
// this Node process). Scoped to this one file via a triple-slash directive
// rather than adding "dom" to the shared tsconfig, which would apply it to
// every file this project's tsconfig.json covers (tests/support, evals,
// every *.config.ts) for a need only this file has.
import { expect, test, type Page } from "@playwright/test";

// docs/MILESTONES.md's M10 Phase 1 per-screen backlog, Aujourd'hui's own
// entry: the fixed w-[300px] right column (Pomodoro, Sons d'ambiance)
// never stacked and overflowed 375px in every state (43px while loading or
// on error, 158px once real content — the todos card, a due course card —
// renders beside it), and four touch targets had no 44px hit zone at any
// breakpoint. This is this screen's own dedicated 375x812 viewport
// override (docs/UI.md's Responsive conventions: a per-spec override,
// never a second playwright.config.ts project), covering both fixes
// across all four required states (docs/UI.md's Required states).
//
// Loading and error have no honest real-backend trigger: GET /api/today
// answers too fast to observe "loading" without waitForTimeout (banned,
// docs/TESTING.md's End-to-end note), and a healthy backend never answers
// it with a 500. Empty has no *reliable* real-backend trigger either, once
// this suite is considered as a whole: today.spec.ts and
// streak-and-countdown.spec.ts (docs/TESTING.md's "one database per run")
// both deliberately leave a due card unreviewed for this same shared
// account, so a plain page.goto() here cannot assume the account is ever
// empty again once either has already run. page.route() intercepts all
// three, fulfilling with a real, contract-shaped TodayView instead of
// reading whatever the shared account happens to hold — the same two
// states (loading, error) TodayScreen.unit.test.tsx already stubs fetch
// for at the jsdom layer, plus empty, all now against a real browser's
// real layout instead. Only "ready" needs the real backend: it is the one
// state this pass's own fix must hold up against actual generated content,
// not a hand-built fixture.
test.describe("Aujourd'hui mobile (M10 Phase 1)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  async function scrollWidth(page: Page): Promise<number> {
    return page.evaluate(() => document.documentElement.scrollWidth);
  }

  // GET /api/today carries a query string (today=…&dayBoundary=…,
  // apps/web/src/lib/today-api.ts) — a bare "**/api/today" glob only
  // matches a URL with nothing after "today" and silently never fires,
  // letting the request through to the real backend instead. Matching the
  // path with a regexp, query string or not, is what actually intercepts it.
  const TODAY_ROUTE = /\/api\/today(\?|$)/;

  const EMPTY_TODAY_VIEW = { date: "2026-01-04", dueCards: [], notionsBelowTarget: [], todos: [], upcomingDeadlines: [], streak: 0 };

  test("loading state: no horizontal overflow", async ({ page }) => {
    await page.route(TODAY_ROUTE, async () => {
      // Deliberately never fulfilled/continued/aborted: the request stays
      // pending, which is exactly the "loading" state to verify.
    });
    await page.goto("/");
    await page.getByText("Chargement…").waitFor();

    expect(await scrollWidth(page)).toBeLessThanOrEqual(375);
  });

  test("error state: no horizontal overflow", async ({ page }) => {
    await page.route(TODAY_ROUTE, (route) => route.fulfill({ status: 500, body: "" }));
    await page.goto("/");
    await page.getByRole("alert").waitFor();

    expect(await scrollWidth(page)).toBeLessThanOrEqual(375);
  });

  test("empty state: no horizontal overflow", async ({ page }) => {
    await page.route(TODAY_ROUTE, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(EMPTY_TODAY_VIEW) }));
    await page.goto("/");
    await page.getByText(/rien à réviser pour l'instant/i).waitFor();

    expect(await scrollWidth(page)).toBeLessThanOrEqual(375);
  });

  test("ready state: no horizontal overflow with a real due course card, the checkbox/delete tap zones on a shared todo row don't overlap, and a click just outside the checkbox's own box still toggles it", async ({ page }) => {
    test.setTimeout(60_000); // extra room: extraction and generation, same as today.spec.ts
    await page.goto("/");

    // The app's home is now Aujourd'hui (M9), not Mes cours — UploadCard is
    // always open once there, no "+ Ajouter un cours" toggle to click through.
    await page.getByRole("button", { name: "Mes cours", exact: true }).click();
    await page.getByLabel("Titre du cours").fill("Cours mobile");
    await page.getByLabel(/dépose un fichier/i).setInputFiles({ name: "page.jpg", mimeType: "image/jpeg", buffer: Buffer.from("page") });
    await page.getByRole("button", { name: "Créer le cours" }).click();

    const documentCard = page.getByTestId("document-card").filter({ hasText: "Cours mobile" });
    await expect(documentCard.getByRole("button", { name: "Lire le cours" })).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Notions", exact: true }).click();
    await page.getByRole("button", { name: "Cours mobile", exact: true }).click();

    const notionCards = page.getByTestId("notion-card");
    await expect(notionCards.first()).toBeVisible({ timeout: 15_000 });
    const notionCount = await notionCards.count();

    await page.getByRole("button", { name: "Créer les fiches" }).click();

    const docsRes = await page.request.get("/api/documents");
    const documents = (await docsRes.json()) as { id: string; title: string }[];
    const documentId = documents.find((d) => d.title === "Cours mobile")?.id;
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
    const courseCard = page.getByTestId("course-today-card").filter({ hasText: "Cours mobile" });
    await expect(courseCard).toBeVisible({ timeout: 10_000 });

    // A todo on the same screen, for the checks below. A label distinct
    // from every other spec's own todo label (today.spec.ts also creates
    // one reading "Réviser demain") — this suite shares one account/database
    // across every spec file in a run (docs/TESTING.md), so a colliding
    // label would make `getByRole(..., { name })` resolve to more than one
    // element once both specs have run.
    await page.getByRole("button", { name: "Ajouter un todo" }).click();
    await page.getByLabel("Nouveau todo").fill("Réviser en mobilité");
    await page.getByRole("button", { name: "Ajouter", exact: true }).click();
    const checkbox = page.getByRole("checkbox", { name: "Réviser en mobilité" });
    await expect(checkbox).toBeVisible({ timeout: 10_000 });

    expect(await scrollWidth(page)).toBeLessThanOrEqual(375);

    // The one arbitration point named ahead of this pass: if the checkbox's
    // own enlarged 44px zone and the delete button's own enlarged 44px zone
    // (both on the same todo row) turned out to overlap, one would cover
    // the other and this assertion would fail — a real, measured check, not
    // an assumption, of a genuine risk the flex-1 label between them
    // happens to rule out in practice (it consumes the row's own remaining
    // width, keeping both ends far apart) but was never guaranteed by
    // construction.
    const checkboxBox = await checkbox.boundingBox();
    const deleteButton = page.getByRole("button", { name: "Supprimer « Réviser en mobilité »" });
    const deleteBox = await deleteButton.boundingBox();
    if (!checkboxBox || !deleteBox) throw new Error("expected both the checkbox and the delete button to report a bounding box");
    const gap = deleteBox.x - (checkboxBox.x + checkboxBox.width);
    expect(gap).toBeGreaterThanOrEqual(44);

    // Proves the enlarged zone is real, not just present in the markup: a
    // click 10px outside the checkbox's own 18px box on both axes (still
    // inside its 44px pseudo-element) toggles it — the wrapping <label>
    // forwarding the click to the input it wraps, the ordinary behaviour of
    // a <label> around a control. page.mouse.click() at a raw page
    // coordinate, not locator.click({ position }): Playwright's own
    // actionability check for the latter requires the checkbox locator's
    // own element to be the one actually receiving the hit-test, and at
    // this point it's genuinely the <label> that does (correctly — that's
    // what makes the enlarged zone work at all) — a real browser still
    // delivers the click to the input either way, which is the one thing
    // this assertion cares about.
    await expect(checkbox).not.toBeChecked();
    await page.mouse.click(checkboxBox.x - 10, checkboxBox.y - 10);
    await expect(checkbox).toBeChecked();
  });

  test("the todos-card's two triggers still open their own form when clicked just outside their real box", async ({ page }) => {
    await page.route(TODAY_ROUTE, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(EMPTY_TODAY_VIEW) }));
    await page.goto("/");
    await page.getByText(/rien à réviser pour l'instant/i).waitFor();

    // "Ajouter un todo" is 24px square; clicking 10px outside it (still
    // inside its 44px pseudo-element, generated on the button itself here,
    // not a separate wrapper) still opens the add-todo form.
    await page.getByRole("button", { name: "Ajouter un todo" }).click({ position: { x: -10, y: -10 } });
    await expect(page.getByLabel("Nouveau todo")).toBeVisible();
  });
});
