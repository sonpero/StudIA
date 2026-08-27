import { describe, expect, it } from "vitest";
import { ABANDONED_DOCUMENT_THRESHOLD_MS, isAbandonedDocument } from "./is-abandoned.js";

const createdAt = new Date("2026-01-01T00:00:00.000Z");

function minutesLater(minutes: number): Date {
  return new Date(createdAt.getTime() + minutes * 60 * 1000);
}

describe("isAbandonedDocument", () => {
  it("is not abandoned before the threshold, even with no job", () => {
    const justUnderThreshold = new Date(createdAt.getTime() + ABANDONED_DOCUMENT_THRESHOLD_MS - 1);
    expect(isAbandonedDocument(createdAt.toISOString(), false, justUnderThreshold)).toBe(false);
  });

  it("is abandoned once the threshold is reached, with no job", () => {
    const atThreshold = new Date(createdAt.getTime() + ABANDONED_DOCUMENT_THRESHOLD_MS);
    expect(isAbandonedDocument(createdAt.toISOString(), false, atThreshold)).toBe(true);
  });

  it("is abandoned well past the threshold, with no job", () => {
    expect(isAbandonedDocument(createdAt.toISOString(), false, minutesLater(120))).toBe(true);
  });

  it("is never abandoned once a job exists, no matter how old", () => {
    expect(isAbandonedDocument(createdAt.toISOString(), true, minutesLater(120))).toBe(false);
  });
});
