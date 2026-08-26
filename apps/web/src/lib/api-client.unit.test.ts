// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, setUnauthorizedHandler } from "./api-client.js";

describe("apiFetch", () => {
  afterEach(() => {
    setUnauthorizedHandler(null);
    vi.unstubAllGlobals();
  });

  it("sends credentials so the session cookie is included", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/me");

    expect(fetchMock).toHaveBeenCalledWith("/api/me", expect.objectContaining({ credentials: "include" }));
  });

  it("calls the registered unauthorized handler on a 401 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    const handler = vi.fn();
    setUnauthorizedHandler(handler);

    await apiFetch("/api/me");

    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not call the handler on a non-401 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    const handler = vi.fn();
    setUnauthorizedHandler(handler);

    await apiFetch("/api/me");

    expect(handler).not.toHaveBeenCalled();
  });

  it("skips the handler when suppressUnauthorizedHandler is set (e.g. the login call itself)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    const handler = vi.fn();
    setUnauthorizedHandler(handler);

    await apiFetch("/api/auth/login", { suppressUnauthorizedHandler: true });

    expect(handler).not.toHaveBeenCalled();
  });
});
