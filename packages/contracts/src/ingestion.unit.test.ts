import { describe, expect, it } from "vitest";
import { createDocumentRequestSchema, documentDetailSchema } from "./ingestion.js";

describe("createDocumentRequestSchema", () => {
  it("accepts a title and a known source type", () => {
    expect(createDocumentRequestSchema.safeParse({ title: "Cours", sourceType: "photo" }).success).toBe(true);
  });

  it("rejects an unknown source type", () => {
    expect(createDocumentRequestSchema.safeParse({ title: "Cours", sourceType: "video" }).success).toBe(false);
  });

  it("rejects an empty title", () => {
    expect(createDocumentRequestSchema.safeParse({ title: "", sourceType: "photo" }).success).toBe(false);
  });
});

describe("documentDetailSchema", () => {
  it("accepts a full document detail with a null lastError", () => {
    const result = documentDetailSchema.safeParse({
      id: "d1",
      title: "Cours",
      sourceType: "photo",
      status: "done",
      pageCount: 2,
      colour: "#F87171",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastError: null,
      markdown: null,
    });
    expect(result.success).toBe(true);
  });
});
