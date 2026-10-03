import { randomUUID } from "node:crypto";
import path from "node:path";
import Database from "better-sqlite3";
import { expect, test, type Page } from "@playwright/test";
import { E2E_DATA_DIR, TEST_USERNAME } from "./support/env.js";

// The correct option's position on screen must change from one
// presentation to the next, for every MCQ: those stored before M11 (whose
// options were kept in the model's order, answer first) as much as those
// created by the course-level job. The order is decided where the learner
// sees it, not in storage. Picking the correct option is graded right
// wherever it lands, since grading compares the option's text, never its
// place.
//
// The database is the e2e run's own throwaway one (docs/TESTING.md): the
// old-style MCQ is written straight into it, as no flow creates one any more.

const PRESENTATIONS = 20;

function openDb(): Database.Database {
  const db = new Database(path.join(E2E_DATA_DIR, "studia.db"));
  db.pragma("busy_timeout = 5000");
  return db;
}

async function createCourseWithCards(page: Page, title: string): Promise<string> {
  await page.goto("/");
  await page.getByRole("button", { name: "Mes cours", exact: true }).click();
  await page.getByLabel("Titre du cours").fill(title);
  await page.getByLabel(/dépose un fichier/i).setInputFiles({ name: "page.jpg", mimeType: "image/jpeg", buffer: Buffer.from("page") });
  await page.getByRole("button", { name: "Créer le cours" }).click();
  await expect(page.getByTestId("document-card").filter({ hasText: title }).getByRole("button", { name: "Lire le cours" })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Notions", exact: true }).click();
  await page.getByRole("button", { name: title, exact: true }).click();
  await expect(page.getByTestId("notion-card").first()).toBeVisible({ timeout: 15_000 });
  const documentId = ((await (await page.request.get("/api/documents")).json()) as { id: string; title: string }[]).find((d) => d.title === title)?.id;
  if (!documentId) throw new Error("expected the just-created document to be listed");

  await page.getByRole("button", { name: "Créer les fiches" }).click();
  await expect
    .poll(async () => (await (await page.request.get(`/api/documents/${documentId}/generation-status`)).json()) as unknown, { timeout: 45_000 })
    .toEqual({ done: 1, total: 1, failed: 0 });
  return documentId;
}

// Shows the notion's only card (an MCQ) PRESENTATIONS times, leaving each
// session with « Quitter » (no rating, so the card stays due), and returns
// where the correct option was displayed each time.
async function correctPositions(page: Page, notionTitle: string, question: string, options: string[], answer: string): Promise<number[]> {
  const positions: number[] = [];
  for (let i = 0; i < PRESENTATIONS; i++) {
    await page.getByTestId("notion-card").filter({ hasText: notionTitle }).getByRole("button", { name: "Réviser", exact: true }).click();
    await expect(page.getByText(question, { exact: true })).toBeVisible({ timeout: 10_000 });
    const displayed = await page.locator("main button").evaluateAll(
      (buttons, names) => buttons.map((b) => (b.textContent ?? "").trim()).filter((text) => names.includes(text)),
      options,
    );
    expect([...displayed].sort()).toEqual([...options].sort());
    positions.push(displayed.indexOf(answer));
    await page.getByRole("button", { name: "Quitter" }).click();
    await expect(page.getByTestId("notion-card").filter({ hasText: notionTitle })).toBeVisible({ timeout: 10_000 });
  }
  return positions;
}

async function pickCorrectAndExpectCorrect(page: Page, notionTitle: string, question: string, answer: string): Promise<void> {
  await page.getByTestId("notion-card").filter({ hasText: notionTitle }).getByRole("button", { name: "Réviser", exact: true }).click();
  await expect(page.getByText(question, { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: answer, exact: true }).click();
  await expect(page.getByText("Correct.")).toBeVisible({ timeout: 10_000 });
}

test.describe("MCQ options are shuffled on display, every time", () => {
  test("an MCQ stored with its answer first, as before M11, is not always shown answer first, and is graded right", async ({ page }) => {
    test.setTimeout(180_000);
    const documentId = await createCourseWithCards(page, "Cours de cristallographie");

    const answer = "Le réseau de Bravais";
    const options = [answer, "La maille de Wigner", "Le plan réticulaire", "La symétrie du motif"];
    const question = "Quelle notion décrit la répétition périodique d'un cristal ?";
    const notionTitle = "Réseau cristallin (ancien QCM)";
    const db = openDb();
    try {
      const userId = (db.prepare("SELECT id FROM users WHERE username = ?").get(TEST_USERNAME) as { id: string }).id;
      const { next } = db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM notions WHERE document_id = ?").get(documentId) as { next: number };
      const notionId = randomUUID();
      const now = new Date().toISOString();
      db.prepare("INSERT INTO notions (id, document_id, user_id, title, body, difficulty, position, created_at) VALUES (?, ?, ?, ?, ?, 'medium', ?, ?)").run(
        notionId,
        documentId,
        userId,
        notionTitle,
        "Un cristal répète un motif selon un réseau.",
        next,
        now,
      );
      db.prepare(
        "INSERT INTO cards (id, notion_id, user_id, type, state, question, answer, options_json, created_at) VALUES (?, ?, ?, 'mcq', 'active', ?, ?, ?, ?)",
      ).run(randomUUID(), notionId, userId, question, answer, JSON.stringify(options), now);
    } finally {
      db.close();
    }
    await page.reload();
    await page.getByRole("button", { name: "Notions", exact: true }).click();
    await page.getByRole("button", { name: "Cours de cristallographie", exact: true }).click();

    const positions = await correctPositions(page, notionTitle, question, options, answer);
    expect(new Set(positions).size, `correct option positions over ${String(PRESENTATIONS)} presentations: ${positions.join(",")}`).toBeGreaterThan(1);
    await pickCorrectAndExpectCorrect(page, notionTitle, question, answer);
  });

  test("an MCQ created by the course-level job (simulated model output) moves too, and is graded right", async ({ page }) => {
    test.setTimeout(180_000);
    const documentId = await createCourseWithCards(page, "Cours de minéralogie");

    // The fixture card generator: key notion 1's MCQ is "QCM 1 ?", correct
    // option "Bonne réponse 1". Its notion keeps only that card, so each
    // « Réviser » on it shows exactly this MCQ.
    const db = openDb();
    let notionTitle: string;
    let options: string[];
    try {
      const card = db
        .prepare(
          "SELECT c.notion_id AS notionId, c.options_json AS optionsJson, n.title AS title FROM cards c JOIN notions n ON n.id = c.notion_id WHERE n.document_id = ? AND c.type = 'mcq' AND c.question = 'QCM 1 ?'",
        )
        .get(documentId) as { notionId: string; optionsJson: string; title: string };
      db.prepare("DELETE FROM cards WHERE notion_id = ? AND type != 'mcq'").run(card.notionId);
      notionTitle = card.title;
      options = JSON.parse(card.optionsJson) as string[];
    } finally {
      db.close();
    }
    await page.reload();
    await page.getByRole("button", { name: "Notions", exact: true }).click();
    await page.getByRole("button", { name: "Cours de minéralogie", exact: true }).click();

    const positions = await correctPositions(page, notionTitle, "QCM 1 ?", options, "Bonne réponse 1");
    expect(new Set(positions).size, `correct option positions over ${String(PRESENTATIONS)} presentations: ${positions.join(",")}`).toBeGreaterThan(1);
    await pickCorrectAndExpectCorrect(page, notionTitle, "QCM 1 ?", "Bonne réponse 1");
  });
});
