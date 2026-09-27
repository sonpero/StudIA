import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { SqliteJobQueue, uuidV7Generator } from "@studia/core";
import { expect, test, type Page } from "@playwright/test";
import { E2E_DATA_DIR } from "./support/env.js";

// A failed notion split used to be invisible: Mes cours showed the course
// as ready and Notions said "reviens un peu plus tard" forever. The notion
// step's own failure must show on both screens, with a "Réessayer" that
// relaunches notion creation only, never the extraction.
const FAILURE_MESSAGE = "Les notions de ce cours n'ont pas pu être créées.";

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

function jobsFor(type: string, documentId: string): { id: string; status: string }[] {
  const sqlite = openDb();
  try {
    return sqlite
      .prepare("SELECT id, status FROM jobs WHERE type = ? AND json_extract(payload_json, '$.documentId') = ? ORDER BY created_at DESC")
      .all(type, documentId) as { id: string; status: string }[];
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

// Forces the course's split-notions job to a terminal failure, the way an
// exhausted-retries job ends up (same fail(..., { terminal: true }) route as
// upload-document.spec.ts's failed extraction). The fixture splitter always
// succeeds, and fast, so the job is first allowed to finish — failing it
// while the worker still holds it would race the worker's own complete().
// Its notions are then deleted too: a real failed split never wrote any
// (handleSplitJob only writes on success), so "failed, no notions" is the
// state a student actually meets.
async function failNotionSplit(documentId: string) {
  await expect
    .poll(() => jobsFor("split-notions", documentId)[0]?.status, { timeout: 30_000 })
    .toBe("done");
  const sqlite = openDb();
  try {
    const jobQueue = new SqliteJobQueue(drizzle(sqlite), uuidV7Generator);
    await jobQueue.fail(jobsFor("split-notions", documentId)[0]!.id, "Splitting produced 3 notions, expected 5 to 60", new Date(), { terminal: true });
    sqlite.prepare("DELETE FROM notions WHERE document_id = ?").run(documentId);
  } finally {
    sqlite.close();
  }
}

test.describe("notion split failure", () => {
  test("a failed notion split shows on Mes cours and Notions, and Notions' retry creates the notions", async ({ page }) => {
    test.setTimeout(90_000);
    const title = "Notions ratées";
    await createCourse(page, title);
    const documentId = documentIdByTitle(title);
    await failNotionSplit(documentId);

    // Reload: nothing is polling any more once the split had finished.
    await page.reload();
    await page.getByRole("button", { name: "Mes cours", exact: true }).click();
    const card = page.getByTestId("document-card").filter({ hasText: title });
    await expect(card.getByText(FAILURE_MESSAGE)).toBeVisible({ timeout: 10_000 });
    await expect(card.getByRole("button", { name: "Réessayer" })).toBeVisible();
    // The raw job error is developer-facing, never shown.
    await expect(page.getByText(/expected 5 to 60/)).toHaveCount(0);

    await page.getByRole("button", { name: "Notions", exact: true }).click();
    await page.getByRole("button", { name: title, exact: true }).click();
    const main = page.getByRole("main");
    await expect(main.getByText(FAILURE_MESSAGE)).toBeVisible({ timeout: 10_000 });
    await expect(main.getByText(/reviens un peu plus tard/i)).toHaveCount(0);

    await main.getByRole("button", { name: "Réessayer" }).click();

    await expect(page.getByTestId("notion-card")).toHaveCount(5, { timeout: 30_000 });
    await expect(main.getByText(FAILURE_MESSAGE)).toHaveCount(0);
    // Only the notion step was relaunched: still the one extraction job.
    expect(jobsFor("extract-document", documentId)).toHaveLength(1);
    expect(jobsFor("split-notions", documentId)).toHaveLength(2);
  });

  test("Mes cours' retry relaunches notion creation only, and the course's notions then show", async ({ page }) => {
    test.setTimeout(90_000);
    const title = "Notions à relancer";
    await createCourse(page, title);
    const documentId = documentIdByTitle(title);
    await failNotionSplit(documentId);

    await page.reload();
    await page.getByRole("button", { name: "Mes cours", exact: true }).click();
    const card = page.getByTestId("document-card").filter({ hasText: title });
    await expect(card.getByText(FAILURE_MESSAGE)).toBeVisible({ timeout: 10_000 });

    await card.getByRole("button", { name: "Réessayer" }).click();

    await expect(card.getByText(/5 notions/)).toBeVisible({ timeout: 30_000 });
    await expect(card.getByText(FAILURE_MESSAGE)).toHaveCount(0);
    expect(jobsFor("extract-document", documentId)).toHaveLength(1);
    expect(jobsFor("split-notions", documentId)).toHaveLength(2);
  });
});
