import { describe, expect, it } from "vitest";
import { APP_NAME } from "./app-info.js";

describe("app-info", () => {
  it("exposes the app name", () => {
    expect(APP_NAME).toBe("StudIA");
  });
});
