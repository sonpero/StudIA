import { describe, expect, it } from "vitest";
import * as contracts from "./index.js";

describe("@studia/contracts", () => {
  it("resolves as a module", () => {
    expect(contracts).toBeTypeOf("object");
  });
});
