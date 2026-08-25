import { describe, expect, it } from "vitest";
import * as core from "./index.js";

describe("@studia/core", () => {
  it("resolves as a module", () => {
    expect(core).toBeTypeOf("object");
  });
});
