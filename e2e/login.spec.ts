import { expect, test } from "@playwright/test";
import { TEST_PASSWORD, TEST_USERNAME } from "./support/env.js";

// Every other e2e spec reuses the authenticated storageState saved by
// global setup. This one must not: it is the dedicated test for the login
// flow itself (docs/TESTING.md), so it starts from a blank session.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("login", () => {
  test("full login and logout cycle", async ({ page }) => {
    await page.goto("/");

    const loginButton = page.getByRole("button", { name: "Se connecter" });
    await expect(loginButton).toBeVisible();

    await page.getByLabel("Identifiant").fill(TEST_USERNAME);
    await page.getByLabel("Mot de passe").fill(TEST_PASSWORD);
    await loginButton.click();

    await expect(page.getByText(`Bonjour, ${TEST_USERNAME}.`)).toBeVisible();

    await page.getByRole("button", { name: "Se déconnecter" }).click();

    await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
  });

  test("visiting the app while unauthenticated never shows protected content, only the login screen", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
    await expect(page.getByText(/bonjour/i)).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).not.toBeVisible();
  });
});
