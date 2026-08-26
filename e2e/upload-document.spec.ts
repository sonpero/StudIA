import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { SqliteJobQueue, uuidV7Generator } from "@studia/core";
import { expect, test } from "@playwright/test";
import { E2E_DATA_DIR } from "./support/env.js";

// docs/modules/ingestion.md / MILESTONES.md: "upload three photos as one
// document, watch the status reach done, read the text; and the failure
// path with a retry."
test.describe("upload and extraction", () => {
  test("uploading three photos as one document reaches done and the extracted text can be read", async ({ page }) => {
    await page.goto("/");

    await page.getByText("+ Ajouter un cours").click();
    await page.getByLabel("Titre du cours").fill("Trois photos");

    const fileInput = page.getByLabel("Photos ou document");
    await fileInput.setInputFiles([
      { name: "page1.jpg", mimeType: "image/jpeg", buffer: Buffer.from("page-1") },
      { name: "page2.jpg", mimeType: "image/jpeg", buffer: Buffer.from("page-2") },
      { name: "page3.jpg", mimeType: "image/jpeg", buffer: Buffer.from("page-3") },
    ]);

    // All three staged as one document, reorderable/removable before confirming.
    await expect(page.getByText("page1.jpg")).toBeVisible();
    await expect(page.getByText("page2.jpg")).toBeVisible();
    await expect(page.getByText("page3.jpg")).toBeVisible();

    await page.getByRole("button", { name: "Confirmer" }).click();

    const card = page.getByTestId("document-card").filter({ hasText: "Trois photos" });
    await expect(card.getByText("3 pages")).toBeVisible();
    await expect(card.getByText("Terminé")).toBeVisible({ timeout: 15_000 });

    await card.getByRole("button", { name: "Voir le texte" }).click();
    // FixtureDocumentExtractor's "valid" case (docs/TESTING.md's required
    // fixture cases): real, readable extracted Markdown, not a placeholder.
    await expect(card.getByText("Contenu extrait.")).toBeVisible();
  });

  test("a failed extraction shows a retry, and the retry works", async ({ page }) => {
    await page.goto("/");

    await page.getByText("+ Ajouter un cours").click();
    await page.getByLabel("Titre du cours").fill("Cours en échec");
    await page.getByLabel("Photos ou document").setInputFiles({ name: "page.jpg", mimeType: "image/jpeg", buffer: Buffer.from("page") });
    await page.getByRole("button", { name: "Confirmer" }).click();

    const card = page.getByTestId("document-card").filter({ hasText: "Cours en échec" });
    await expect(card.getByText(/en attente|lecture en cours/i)).toBeVisible();

    // Force the job straight to failed (terminal), the same way an
    // exhausted-retries job would end up — without waiting through real
    // backoff delays (docs/modules/jobs.md's fail(..., { terminal: true })).
    const sqlite = new Database(path.join(E2E_DATA_DIR, "studia.db"));
    const jobQueue = new SqliteJobQueue(drizzle(sqlite), uuidV7Generator);
    const rows = sqlite.prepare("SELECT id, payload_json FROM jobs WHERE type = 'extract-document' ORDER BY created_at DESC").all() as {
      id: string;
      payload_json: string;
    }[];
    const documentTitleRow = sqlite.prepare("SELECT id FROM documents WHERE title = 'Cours en échec'").get() as { id: string };
    const targetJob = rows.find((row) => (JSON.parse(row.payload_json) as { documentId: string }).documentId === documentTitleRow.id);
    if (!targetJob) throw new Error("expected an extract-document job to exist for the new document");
    await jobQueue.fail(targetJob.id, "La photo est trop floue pour être lue.", new Date(), { terminal: true });
    sqlite.close();

    await expect(card.getByText("Échec")).toBeVisible({ timeout: 10_000 });
    const retryButton = card.getByRole("button", { name: "Réessayer" });
    await expect(retryButton).toBeVisible();

    await retryButton.click();

    await expect(card.getByText("Terminé")).toBeVisible({ timeout: 15_000 });
  });
});
