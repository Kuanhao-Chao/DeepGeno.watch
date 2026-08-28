import { describe, expect, it, vi } from "vitest";
import { AllowlistedHttpClient } from "./http.js";

describe("AllowlistedHttpClient", () => {
  it("denies non-HTTPS, credentialed, and non-allowlisted URLs", () => {
    const http = new AllowlistedHttpClient({
      allowedHosts: ["allowed.example"],
    });

    expect(() =>
      http.assertAllowed(new URL("http://allowed.example/data")),
    ).toThrow(/Only HTTPS/);
    expect(() =>
      http.assertAllowed(new URL("https://blocked.example/data")),
    ).toThrow(/not allowlisted/);
    expect(() =>
      http.assertAllowed(new URL("https://user:pass@allowed.example/data")),
    ).toThrow(/Credentials/);
  });

  it("enforces response-size limits even without a trusted content length", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(
        new Response("x".repeat(33), { status: 200 }),
      ) as unknown as typeof fetch;
    const http = new AllowlistedHttpClient({
      allowedHosts: ["allowed.example"],
      fetchImplementation,
      maxResponseBytes: 32,
    });

    await expect(
      http.getText("https://allowed.example/data"),
    ).rejects.toMatchObject({
      code: "source_too_large",
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ method: "GET", redirect: "error" }),
    );
  });

  it("wraps malformed JSON as a stable source error", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(
        new Response("not-json", { status: 200 }),
      ) as unknown as typeof fetch;
    const http = new AllowlistedHttpClient({
      allowedHosts: ["allowed.example"],
      fetchImplementation,
    });

    await expect(
      http.getJson("https://allowed.example/data"),
    ).rejects.toMatchObject({
      code: "source_invalid_json",
    });
  });

  it("paces concurrent requests through one shared host budget", async () => {
    vi.useFakeTimers();
    try {
      const fetchImplementation = vi
        .fn()
        .mockImplementation(
          async () => new Response("ok", { status: 200 }),
        ) as unknown as typeof fetch;
      const http = new AllowlistedHttpClient({
        allowedHosts: ["allowed.example"],
        fetchImplementation,
        minimumIntervalMsByHost: { "allowed.example": 100 },
      });

      const first = http.getText("https://allowed.example/first");
      const second = http.getText("https://allowed.example/second");
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchImplementation).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(99);
      expect(fetchImplementation).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await Promise.all([first, second]);
      expect(fetchImplementation).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries a rate-limited request before surfacing a source error", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("rate limited", {
          status: 429,
          headers: { "Retry-After": "0" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("ok", { status: 200 }),
      ) as unknown as typeof fetch;
    const http = new AllowlistedHttpClient({
      allowedHosts: ["allowed.example"],
      fetchImplementation,
    });

    await expect(http.getText("https://allowed.example/data")).resolves.toBe(
      "ok",
    );
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });
});
