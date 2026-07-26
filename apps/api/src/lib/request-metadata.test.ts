import { describe, expect, test } from "bun:test";
import { extractIpAddress, extractUserAgent } from "./request-metadata";

describe("request-metadata helpers", () => {
  test("extractIpAddress ambil IP pertama dari X-Forwarded-For", () => {
    const request = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" },
    });

    expect(extractIpAddress(request)).toBe("203.0.113.5");
  });

  test("extractIpAddress fallback ke X-Real-IP kalau X-Forwarded-For tidak ada", () => {
    const request = new Request("http://localhost/", {
      headers: { "x-real-ip": "192.168.1.10" },
    });

    expect(extractIpAddress(request)).toBe("192.168.1.10");
  });

  test("extractIpAddress return null kalau tidak ada header IP sama sekali", () => {
    const request = new Request("http://localhost/");
    expect(extractIpAddress(request)).toBeNull();
  });

  test("extractUserAgent mengambil header User-Agent", () => {
    const request = new Request("http://localhost/", {
      headers: { "user-agent": "Mozilla/5.0 TestBrowser" },
    });

    expect(extractUserAgent(request)).toBe("Mozilla/5.0 TestBrowser");
  });
});