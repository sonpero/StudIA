// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { getCachedConversationId, setCachedConversationId } from "./tutor-storage.js";

describe("tutor conversation storage", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("returns null for a document with no cached conversation", () => {
    expect(getCachedConversationId("doc-1")).toBeNull();
  });

  it("round-trips a cached conversation id, scoped per document", () => {
    setCachedConversationId("doc-1", "c1");
    setCachedConversationId("doc-2", "c2");

    expect(getCachedConversationId("doc-1")).toBe("c1");
    expect(getCachedConversationId("doc-2")).toBe("c2");
  });

  it("overwrites the cached id for the same document on a later call", () => {
    setCachedConversationId("doc-1", "c1");
    setCachedConversationId("doc-1", "c2");

    expect(getCachedConversationId("doc-1")).toBe("c2");
  });

  it("never throws when storage access itself throws (private window, blocked storage)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => setCachedConversationId("doc-1", "c1")).not.toThrow();
    expect(getCachedConversationId("doc-1")).toBeNull();
  });
});
