import { expect, test } from "@playwright/test";

// docs/MILESTONES.md's M6 demo: "Photograph a school planner page, get todo
// items, tick them off." The fixture extractor (LLM_ADAPTER=fixture,
// playwright.config.ts) always returns two known todos for a "valid" photo
// (packages/core/src/workspace/infra/fixture-todo-extractor.ts) — this test
// accepts only one of them, which is also where the milestone's central
// invariant (docs/modules/workspace.md) becomes visible end to end: the
// rejected proposal must never appear as a todo.
test.describe("todo photo extraction", () => {
  test("photo of a planner to a confirmed, ticked todo — the unaccepted proposal never becomes one", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/");

    await page.getByRole("button", { name: "Aujourd'hui" }).click();
    await expect(page.getByRole("heading", { name: "Aujourd'hui" })).toBeVisible();

    await page.getByLabel(/photo de l'agenda/i).setInputFiles({ name: "agenda.jpg", mimeType: "image/jpeg", buffer: Buffer.from("fake-agenda-photo") });

    await expect(page.getByRole("heading", { name: "Propositions" })).toBeVisible({ timeout: 10_000 });
    // Generous: the worker process is shared with every other e2e spec's
    // jobs, and under full-suite parallel load this one can sit in the
    // queue behind extraction/split/generation jobs from other specs
    // (same contention e2e/progress.spec.ts's own generous timeouts
    // already accommodate).
    await expect(page.getByText("Rendre le devoir de maths")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("Réviser le contrôle d'histoire")).toBeVisible();

    // Both checked by default; uncheck the one this test will reject.
    const mathsCheckbox = page.getByRole("checkbox", { name: "Rendre le devoir de maths" });
    const histoireCheckbox = page.getByRole("checkbox", { name: "Réviser le contrôle d'histoire" });
    await expect(mathsCheckbox).toBeChecked();
    await expect(histoireCheckbox).toBeChecked();
    await histoireCheckbox.uncheck();

    await page.getByRole("button", { name: "Confirmer la sélection" }).click();

    await expect(page.getByRole("heading", { name: "Aujourd'hui" })).toBeVisible();
    const todoCheckbox = page.getByRole("checkbox", { name: "Rendre le devoir de maths" });
    await expect(todoCheckbox).toBeVisible();
    await expect(todoCheckbox).not.toBeChecked();

    // The central invariant, visible here: the proposal left unchecked
    // before confirming was never copied into todos.
    await expect(page.getByText("Réviser le contrôle d'histoire")).not.toBeVisible();

    // A plain .click(), not .check(): the checkbox reflects server state
    // (no optimistic update) and briefly re-renders unchecked while the
    // PATCH round-trips, which .check()'s stricter actionability check
    // does not tolerate.
    await todoCheckbox.click();
    await expect(todoCheckbox).toBeChecked();

    // Survives a reload: the tick was persisted, not just local UI state.
    await page.reload();
    await page.getByRole("button", { name: "Aujourd'hui" }).click();
    await expect(page.getByRole("checkbox", { name: "Rendre le devoir de maths" })).toBeChecked();
  });
});
