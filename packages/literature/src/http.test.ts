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
});
