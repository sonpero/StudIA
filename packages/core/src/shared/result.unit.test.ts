import { describe, expect, it } from "vitest";
import { err, ok } from "./result.js";

describe("Result", () => {
  it("ok() produces a success result carrying the value", () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
  });

  it("err() produces a failure result carrying the error", () => {
    expect(err("bad")).toEqual({ ok: false, error: "bad" });
  });
});
