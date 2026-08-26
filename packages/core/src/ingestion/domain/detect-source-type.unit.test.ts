import { describe, expect, it } from "vitest";
import { detectSourceType } from "./detect-source-type.js";

describe("detectSourceType", () => {
  it.each([
    ["image/jpeg", "photo.jpg", "photo"],
    ["image/png", "photo.png", "photo"],
    ["image/webp", "photo.webp", "photo"],
    ["application/pdf", "cours.pdf", "pdf"],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "cours.docx", "docx"],
    ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "cours.pptx", "pptx"],
  ] as const)("detects %s as %s", (mimeType, filename, expected) => {
    expect(detectSourceType(mimeType, filename)).toEqual({ ok: true, value: expected });
  });

  it("trusts the real MIME type over a misleading filename extension (a .pdf that is actually a PNG)", () => {
    expect(detectSourceType("image/png", "fake.pdf")).toEqual({ ok: true, value: "photo" });
  });

  it("rejects an unsupported MIME type", () => {
    expect(detectSourceType("application/zip", "archive.zip")).toEqual({ ok: false, error: "unsupported" });
  });
});
