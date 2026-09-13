import { expect, test } from "@playwright/test";
import { TEST_USERNAME } from "./support/env.js";

// docs/MILESTONES.md's M7 demo: "Start a pomodoro, finish it, see the
// session recorded." M9's Aujourd'hui redesign (apps/web/src/screens/
// TodayScreen.tsx's own PomodoroCard) dropped the optional todo-linking
// select — startPomodoro is now always called with no todoId, by product
// decision, not an oversight — and "recorded" is now the session counter
// ("N séances de concentration"), not a separate confirmation banner. No
// history this milestone (docs/modules/workspace.md's Pomodoro note): a
// reload finds no active session and resets to the repos state, including
// that counter.
test.describe("pomodoro", () => {
  test("start a session, see the countdown, finish it, and a reload resets to repos", async ({ page }) => {
    test.setTimeout(30_000);
    await page.goto("/");
    await page.getByRole("button", { name: "Aujourd'hui" }).click();
    // Aujourd'hui's own heading is the greeting now (M9's redesign), not the
    // page name — the nav item's own active state already covers that.
    await expect(page.getByRole("heading", { name: `Bonjour, ${TEST_USERNAME}` })).toBeVisible();

    const pomodoroCard = page.getByTestId("pomodoro-card");
    await expect(pomodoroCard.getByText("0 séance de concentration")).toBeVisible();

    await pomodoroCard.getByRole("button", { name: "Démarrer" }).click();

    await expect(pomodoroCard.getByRole("button", { name: "Terminer" })).toBeVisible({ timeout: 10_000 });
    await expect(pomodoroCard.getByText(/^\d{2}:\d{2}$/)).toBeVisible();

    await pomodoroCard.getByRole("button", { name: "Terminer" }).click();
    // "Recorded" now means the session counter incrementing (the redesign's
    // own replacement for the confirmation banner it dropped).
    await expect(pomodoroCard.getByRole("button", { name: "Démarrer" })).toBeVisible({ timeout: 10_000 });
    await expect(pomodoroCard.getByText("1 séance de concentration")).toBeVisible();

    // A reload resets the client-only session counter and finds no active
    // session server-side (no history this milestone).
    await page.reload();
    await page.getByRole("button", { name: "Aujourd'hui" }).click();
    const pomodoroCardAfterReload = page.getByTestId("pomodoro-card");
    await expect(pomodoroCardAfterReload.getByRole("button", { name: "Démarrer" })).toBeVisible({ timeout: 10_000 });
    await expect(pomodoroCardAfterReload.getByText("0 séance de concentration")).toBeVisible();
  });

  // M10 Phase 2, lot 2: the countdown reaching zero on its own, not just a
  // manual "Terminer". The backend's own pomodoro duration is fixed at 25
  // minutes (packages/core/src/workspace/domain/types.ts's
  // POMODORO_DURATION_SECONDS, not user-configurable this milestone) — real
  // time is never actually waited out; page.clock jumps the *client's* own
  // clock forward instead (precedent: e2e/generate-and-review.spec.ts's own
  // use of page.clock.install). The server's real clock is untouched:
  // isPomodoroActive's own strict upper bound (packages/core/src/workspace/
  // domain/pomodoro.ts) is what would make GET /api/pomodoro/active stop
  // reporting this session if it were ever refetched — staleTime: Infinity
  // (apps/web/src/lib/use-active-pomodoro.ts) is what ensures it never is
  // during this test, which is exactly what lets the finished state survive
  // client-side past the window at all.
  test("a session reaching zero on its own shows the finished state, and the tab title changes then restores once it auto-closes", async ({ page }) => {
    test.setTimeout(30_000);
    await page.clock.install();
    await page.goto("/");
    await page.getByRole("button", { name: "Aujourd'hui" }).click();
    await expect(page.getByRole("heading", { name: `Bonjour, ${TEST_USERNAME}` })).toBeVisible();

    // Against a local fixture-backed server, the auto-close round trip
    // (PomodoroEffects) resolves fast enough that the finished state can
    // come and go inside a single assertion poll — delaying the close route
    // by a beat is what actually gives this test a real window to observe
    // "finished" as its own state, distinct from idle, rather than only
    // ever seeing whichever one wins the race.
    await page.route("**/api/pomodoro/*/end", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });

    const originalTitle = await page.title();
    const pomodoroCard = page.getByTestId("pomodoro-card");
    await pomodoroCard.getByRole("button", { name: "Démarrer" }).click();
    await expect(pomodoroCard.getByRole("button", { name: "Terminer" })).toBeVisible({ timeout: 10_000 });

    await page.clock.fastForward("25:01");

    await expect(pomodoroCard.getByRole("button", { name: "Démarrer" })).toBeVisible();
    await expect(pomodoroCard.getByText("00:00")).toBeVisible();
    await expect(pomodoroCard.getByText("1 séance de concentration")).toBeVisible();
    await expect.poll(() => page.title()).toContain("Séance terminée");

    // The auto-close call (PomodoroEffects, apps/web/src/components/
    // PomodoroEffects.tsx) is a real network round trip, not a virtualized
    // timer — fastForward accelerates the browser's own JS timers only, so
    // the title's own restoration still needs to be awaited in real time.
    await expect.poll(() => page.title(), { timeout: 10_000 }).toBe(originalTitle);
  });

  // M10 Phase 2, lot 3: a focus session, closed, then a short break started
  // from the same card — the composer's three-segment selector is now a
  // real radiogroup (docs/MILESTONES.md's own M10 Phase 2 acceptance box),
  // and the break's own duration (5 minutes, packages/core/src/workspace/
  // domain/types.ts's POMODORO_SHORT_BREAK_DURATION_SECONDS) and label are
  // both server-derived from the type alone, never client-supplied.
  test("a focus session, closed, then a short break started from the same card shows its own duration and label", async ({ page }) => {
    test.setTimeout(30_000);
    await page.goto("/");
    await page.getByRole("button", { name: "Aujourd'hui" }).click();
    await expect(page.getByRole("heading", { name: `Bonjour, ${TEST_USERNAME}` })).toBeVisible();

    const pomodoroCard = page.getByTestId("pomodoro-card");
    await expect(pomodoroCard.getByRole("radio", { name: "Concentration" })).toBeChecked();

    await pomodoroCard.getByRole("button", { name: "Démarrer" }).click();
    await expect(pomodoroCard.getByRole("button", { name: "Terminer" })).toBeVisible({ timeout: 10_000 });
    await expect(pomodoroCard.getByRole("radio", { name: "Concentration" })).toBeDisabled();

    await pomodoroCard.getByRole("button", { name: "Terminer" }).click();
    await expect(pomodoroCard.getByRole("button", { name: "Démarrer" })).toBeVisible({ timeout: 10_000 });
    await expect(pomodoroCard.getByText("1 séance de concentration")).toBeVisible();

    // The radio input itself is visually hidden (sr-only) — its own
    // styled <label> carries the pill's paint, exactly what a real click
    // anywhere on the segment lands on and native label-for-control
    // forwarding then checks. Playwright's own actionability check targets
    // the accessible node's own (clipped) box for role locators, so the
    // interaction itself goes through the label; assertions still read the
    // real input's state via role.
    await pomodoroCard.getByText("Pause courte").click();
    await expect(pomodoroCard.getByRole("radio", { name: "Pause courte" })).toBeChecked();

    await pomodoroCard.getByRole("button", { name: "Démarrer" }).click();

    await expect(pomodoroCard.getByRole("button", { name: "Terminer" })).toBeVisible({ timeout: 10_000 });
    await expect(pomodoroCard.getByText("05:00")).toBeVisible();
    await expect(pomodoroCard.getByRole("radio", { name: "Pause courte" })).toBeChecked();

    // A closed break must not be counted as a focus session (the spec's own
    // explicit trap): the counter stays at 1 once this break ends too.
    await pomodoroCard.getByRole("button", { name: "Terminer" }).click();
    await expect(pomodoroCard.getByRole("button", { name: "Démarrer" })).toBeVisible({ timeout: 10_000 });
    await expect(pomodoroCard.getByText("1 séance de concentration")).toBeVisible();
  });
});
