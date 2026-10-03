import { expect, test, type Page } from "@playwright/test";

// A QCM option's text must stay inside its bubble, whatever its length:
// Button's base class is single-line (whitespace-nowrap), so a long answer
// or one long unbroken word used to run out of the bubble, and out of the
// screen at 375px. The course is real (fixture upload and generation); only
// the review session's start is intercepted, to serve one MCQ whose options
// are long — the fixture generator's own options are all short.
const LONG_ANSWER =
  "L'agent distant choisit lui-même la nature de sa réponse : un message direct pour une interaction simple et immédiate, une tâche dès qu'il y a un traitement, une durée ou un résultat à livrer";
const LONG_WORD = `Identifiant${"x".repeat(110)}`;
const OPTIONS = [LONG_ANSWER, LONG_WORD, "Une réponse courte", "Une autre réponse de longueur moyenne pour comparer"];

async function openReviewWithLongMcq(page: Page, courseTitle: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Mes cours", exact: true }).click();
  await page.getByLabel("Titre du cours").fill(courseTitle);
  await page.getByLabel(/dépose un fichier/i).setInputFiles({ name: "page.jpg", mimeType: "image/jpeg", buffer: Buffer.from("page") });
  await page.getByRole("button", { name: "Créer le cours" }).click();
  await expect(page.getByTestId("document-card").filter({ hasText: courseTitle }).getByRole("button", { name: "Lire le cours" })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "Notions", exact: true }).click();
  await page.getByRole("button", { name: courseTitle, exact: true }).click();
  await expect(page.getByTestId("notion-card").first()).toBeVisible({ timeout: 15_000 });
  const documentId = ((await (await page.request.get("/api/documents")).json()) as { id: string; title: string }[]).find((d) => d.title === courseTitle)?.id;
  if (!documentId) throw new Error("expected the just-created document to be listed");

  await page.getByRole("button", { name: "Créer les fiches" }).click();
  await expect
    .poll(async () => (await (await page.request.get(`/api/documents/${documentId}/generation-status`)).json()) as unknown, { timeout: 45_000 })
    .toEqual({ done: 1, total: 1, failed: 0 });

  await page.route("**/api/review/sessions", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sessionId: "long-mcq-session",
        cards: [
          {
            cardId: "long-mcq",
            notionId: "long-mcq-notion",
            type: "mcq",
            state: "active",
            question: "Comment l'agent distant choisit-il la nature de sa réponse ?",
            answer: LONG_ANSWER,
            options: OPTIONS,
            schedule: null,
            mastered: false,
          },
        ],
      }),
    }),
  );
  await page.getByTestId("notions-course-summary").getByRole("button", { name: /^réviser/i }).click({ timeout: 15_000 });
  await expect(page.getByText("Comment l'agent distant choisit-il la nature de sa réponse ?")).toBeVisible({ timeout: 10_000 });
}

async function expectEveryOptionInsideItsBubble(page: Page, viewportWidth: number): Promise<void> {
  for (const option of OPTIONS) {
    const button = page.getByRole("button", { name: option, exact: true });
    await expect(button).toBeVisible();
    const fit = await button.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const text = range.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return {
        textInside: text.left >= box.left - 1 && text.right <= box.right + 1 && text.top >= box.top - 1 && text.bottom <= box.bottom + 1,
        noInnerOverflow: el.scrollWidth <= el.clientWidth + 1,
        right: box.right,
      };
    });
    expect(fit.textInside, `"${option.slice(0, 30)}…" stays inside its bubble`).toBe(true);
    expect(fit.noInnerOverflow, `"${option.slice(0, 30)}…" does not overflow its bubble`).toBe(true);
    expect(fit.right).toBeLessThanOrEqual(viewportWidth);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewportWidth);
}

test.describe("MCQ options wrap inside their bubble — desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test("a long answer and a very long word stay inside their bubbles", async ({ page }) => {
    test.setTimeout(90_000);
    await openReviewWithLongMcq(page, "Cours de biologie marine");
    await expectEveryOptionInsideItsBubble(page, 1280);
  });
});

test.describe("MCQ options wrap inside their bubble — 375px", () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test("a long answer and a very long word stay inside their bubbles", async ({ page }) => {
    test.setTimeout(90_000);
    await openReviewWithLongMcq(page, "Cours de géologie");
    await expectEveryOptionInsideItsBubble(page, 375);
  });
});
