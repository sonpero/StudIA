import { describe, expect, it } from "vitest";
import { isAcceptable } from "./is-acceptable.js";

const TWENTY_MB = 20 * 1024 * 1024;

describe("isAcceptable", () => {
  it("accepts an allowed MIME type within the size limit", () => {
    expect(isAcceptable(1024, "application/pdf")).toBe(true);
  });

  it("accepts exactly 20 MB", () => {
    expect(isAcceptable(TWENTY_MB, "application/pdf")).toBe(true);
  });

  it("rejects anything over 20 MB per page", () => {
    expect(isAcceptable(TWENTY_MB + 1, "application/pdf")).toBe(false);
  });

  it("rejects zero or negative sizes", () => {
    expect(isAcceptable(0, "application/pdf")).toBe(false);
    expect(isAcceptable(-1, "application/pdf")).toBe(false);
  });

  it("rejects a MIME type not on the allow-list, even if the size is fine", () => {
    expect(isAcceptable(1024, "application/zip")).toBe(false);
  });
});
