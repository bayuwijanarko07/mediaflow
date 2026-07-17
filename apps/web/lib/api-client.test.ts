import { describe, expect, test, beforeEach, mock } from "bun:test";
import { setAccessToken, getAccessToken } from "./token-store";

describe("api-client auto-refresh", () => {
  beforeEach(() => {
    setAccessToken(null);
  });

  test("request berhasil di percobaan pertama tidak trigger refresh", async () => {
    let refreshCalled = false;

    global.fetch = mock(async (url: string) => {
      if (url.includes("/auth/refresh")) {
        refreshCalled = true;
        return new Response(JSON.stringify({ accessToken: "new-token" }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: "ok" }), { status: 200 });
    }) as unknown as typeof fetch;

    const { apiFetch } = await import("./api-client");
    const res = await apiFetch("/some-endpoint");

    expect(res.status).toBe(200);
    expect(refreshCalled).toBe(false);
  });

  test("401 trigger refresh lalu retry sekali dan berhasil", async () => {
    let callCount = 0;

    global.fetch = mock(async (url: string) => {
      if (url.includes("/auth/refresh")) {
        return new Response(JSON.stringify({ accessToken: "new-token" }), { status: 200 });
      }
      callCount++;
      // panggilan pertama 401, panggilan kedua (setelah refresh) sukses
      if (callCount === 1) {
        return new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 });
      }
      return new Response(JSON.stringify({ data: "ok" }), { status: 200 });
    }) as unknown as typeof fetch;

    const { apiFetch } = await import("./api-client");
    const res = await apiFetch("/protected-endpoint");

    expect(res.status).toBe(200);
    expect(callCount).toBe(2); // request asli + 1 retry, tidak lebih
    expect(getAccessToken()).toBe("new-token");
  });

  test("401 lalu refresh juga gagal → tidak retry berulang, token di-clear", async () => {
    global.fetch = mock(async (url: string) => {
      if (url.includes("/auth/refresh")) {
        return new Response(JSON.stringify({ message: "Invalid" }), { status: 401 });
      }
      return new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 });
    }) as unknown as typeof fetch;

    const { apiFetch } = await import("./api-client");
    const res = await apiFetch("/protected-endpoint");

    expect(res.status).toBe(401);
    expect(getAccessToken()).toBeNull();
  });
});