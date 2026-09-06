import { describe, expect, it } from "vitest";
import { APP_NAME, APP_TAGLINE } from "./app-info.js";

describe("app-info", () => {
  it("exposes the app name", () => {
    expect(APP_NAME).toBe("StudIA");
  });

  it("exposes the app tagline", () => {
    expect(APP_TAGLINE).toBe("Étudie plus intelligemment");
  });
});
