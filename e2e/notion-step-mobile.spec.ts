/// <reference lib="dom" />
// page.evaluate() reads document.documentElement: see e2e/today-mobile.spec.ts
// for why this file-scoped reference is repeated rather than shared.
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { SqliteJobQueue, uuidV7Generator } from "@studia/core";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { E2E_DATA_DIR } from "./support/env.js";

// The notion step's own states (in progress, failed with "Réessayer", ready)
// were added after M10 Phase 1 adapted Mes cours and Notions to 375px, so no
// mobile spec covered them. Checked here at 375x812 (docs/UI.md's Responsive
// conventions: a per-spec viewport override), on both screens: no
// horizontal scroll, and "Réessayer" a 44px target fully inside the
// viewport. Each state is also saved as a screenshot for the mission report
// (docs/reports/long-documents-notions.md).
//
// Course titles never contain a screen's name ("Mes cours", "Notions"...):
// the e2e account is shared by every spec, and a card heading holding one
// breaks other specs' getByRole("heading", { name }) lookups.
//
// The helpers below repeat e2e/notion-split-failure.spec.ts's own rather than
// moving them to support/: that spec stays untouched.
const FAILURE_MESSAGE = "Les notions de ce cours n'ont pas pu être créées.";
const VIEWPORT_WIDTH = 375;

function openDb() {
  return new Database(path.join(E2E_DATA_DIR, "studia.db"));
}

function documentIdByTitle(title: string): string {
  const sqlite = openDb();
  try {
    const row = sqlite.prepare("SELECT id FROM documents WHERE title = ?").get(title) as { id: string } | undefined;
    if (!row) throw new Error(`expected a document titled ${title}`);
    return row.id;
  } finally {
    sqlite.close();
  }
}

function latestSplitJob(documentId: string): { id: string; status: string } | undefined {
  const sqlite = openDb();
  try {
    return sqlite
      .prepare("SELECT id, status FROM jobs WHERE type = 'split-notions' AND json_extract(payload_json, '$.documentId') = ? ORDER BY created_at DESC")
      .get(documentId) as { id: string; status: string } | undefined;
  } finally {
    sqlite.close();
  }
}

async function createCourse(page: Page, title: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Mes cours", exact: true }).click();
  await page.getByLabel("Titre du cours").fill(title);
  await page.getByLabel(/dépose un fichier/i).setInputFiles({ name: "page.jpg", mimeType: "image/jpeg", buffer: Buffer.from(`page-${title}`) });
  await page.getByRole("button", { name: "Créer le cours" }).click();
}

// Same as notion-split-failure.spec.ts: let the fast fixture split finish,
// then fail it terminally and remove its notions, the state a real failed
// split leaves behind.
async function failNotionSplit(documentId: string) {
  await expect.poll(() => latestSplitJob(documentId)?.status, { timeout: 30_000 }).toBe("done");
  const sqlite = openDb();
  try {
    const jobQueue = new SqliteJobQueue(drizzle(sqlite), uuidV7Generator);
    await jobQueue.fail(latestSplitJob(documentId)!.id, "Splitting produced 3 notions, expected 5 to 60", new Date(), { terminal: true });
    sqlite.prepare("DELETE FROM notions WHERE document_id = ?").run(documentId);
  } finally {
    sqlite.close();
  }
}

// The fixture splitter finishes in well under a second, too fast to observe
// "in progress" for real: the status route reports this one course as
// pending, every other course as the server says.
async function reportSplitPending(page: Page, documentId: string) {
  await page.route("**/api/notions/statuses", async (route) => {
    const response = await route.fetch();
    const rows = (await response.json()) as { documentId: string; status: string }[];
    const patched = rows.map((row) => (row.documentId === documentId ? { ...row, status: "pending" } : row));
    await route.fulfill({ response, json: patched });
  });
}

async function scrollWidth(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth);
}

async function expectTouchTargetInViewport(page: Page, button: ReturnType<Page["getByRole"]>) {
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  if (!box) throw new Error("expected the button to report a bounding box");
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(VIEWPORT_WIDTH);
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
}

test.describe("notion step at 375px", () => {
  test.use({ viewport: { width: VIEWPORT_WIDTH, height: 812 } });

  test("Mes cours: in progress, failed with Réessayer, then ready", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const title = "Étape mobile premier";
    await createCourse(page, title);
    const documentId = documentIdByTitle(title);
    await failNotionSplit(documentId);
    const card = page.getByTestId("document-card").filter({ hasText: title });

    await reportSplitPending(page, documentId);
    await page.reload();
    await page.getByRole("button", { name: "Mes cours", exact: true }).click();
    await expect(card.getByText("Création des notions…")).toBeVisible({ timeout: 10_000 });
    await card.scrollIntoViewIfNeeded();
    expect(await scrollWidth(page)).toBeLessThanOrEqual(VIEWPORT_WIDTH);
    await capture(page, testInfo, "mes-cours-en-cours");

    await page.unrouteAll({ behavior: "wait" });
    await page.reload();
    await page.getByRole("button", { name: "Mes cours", exact: true }).click();
    await expect(card.getByText(FAILURE_MESSAGE)).toBeVisible({ timeout: 10_000 });
    const retry = card.getByRole("button", { name: "Réessayer" });
    await expectTouchTargetInViewport(page, retry);
    expect(await scrollWidth(page)).toBeLessThanOrEqual(VIEWPORT_WIDTH);
    await capture(page, testInfo, "mes-cours-echec");

    await retry.click();
    await expect(card.getByText(/5 notions/)).toBeVisible({ timeout: 30_000 });
    await card.scrollIntoViewIfNeeded();
    expect(await scrollWidth(page)).toBeLessThanOrEqual(VIEWPORT_WIDTH);
    await capture(page, testInfo, "mes-cours-pret");
  });

  test("Notions: in progress, failed with Réessayer, then ready", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const title = "Étape mobile second";
    await createCourse(page, title);
    const documentId = documentIdByTitle(title);
    await failNotionSplit(documentId);
    const main = page.getByRole("main");

    await reportSplitPending(page, documentId);
    await page.reload();
    await page.getByRole("button", { name: "Notions", exact: true }).click();
    await page.getByRole("button", { name: title, exact: true }).click();
    await expect(main.getByText(/création des notions en cours/i)).toBeVisible({ timeout: 10_000 });
    expect(await scrollWidth(page)).toBeLessThanOrEqual(VIEWPORT_WIDTH);
    await capture(page, testInfo, "notions-en-cours");

    await page.unrouteAll({ behavior: "wait" });
    await page.reload();
    await page.getByRole("button", { name: "Notions", exact: true }).click();
    await page.getByRole("button", { name: title, exact: true }).click();
    await expect(main.getByText(FAILURE_MESSAGE)).toBeVisible({ timeout: 10_000 });
    const retry = main.getByRole("button", { name: "Réessayer" });
    await expectTouchTargetInViewport(page, retry);
    expect(await scrollWidth(page)).toBeLessThanOrEqual(VIEWPORT_WIDTH);
    await capture(page, testInfo, "notions-echec");

    await retry.click();
    await expect(page.getByTestId("notion-card")).toHaveCount(5, { timeout: 30_000 });
    expect(await scrollWidth(page)).toBeLessThanOrEqual(VIEWPORT_WIDTH);
    await page.evaluate(() => window.scrollTo(0, 0));
    await capture(page, testInfo, "notions-pret");
  });
});
