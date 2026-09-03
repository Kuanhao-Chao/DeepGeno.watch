import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  privateMarkerPattern,
  publicProvenanceLeakPattern,
} from "./privacy-patterns.mjs";

describe("public build boundary", () => {
  it("does not let the web source import private workflow state", async () => {
    const source = await readFile(
      resolve("apps/web/src/content.config.ts"),
      "utf8",
    ).catch(() => "");
    expect(source).not.toContain("data/private");
  });

  it("recognizes provider keys without flagging Fontsource subset names", () => {
    expect(privateMarkerPattern.test("sk-vietnamese-wght-normal")).toBe(false);
    expect(privateMarkerPattern.test("sk-latin-ext-wght-normal")).toBe(false);
    expect(privateMarkerPattern.test("CLOUDFLARE_AI_API_TOKEN")).toBe(true);
    expect(
      privateMarkerPattern.test("sk-proj-abcdefghijklmnopqrstuvwxyz0123456789"),
    ).toBe(true);
    expect(
      privateMarkerPattern.test(
        "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789",
      ),
    ).toBe(true);
  });

  it("recognizes private provenance fields in rendered public output", () => {
    expect(publicProvenanceLeakPattern.test('"draftId":"draft-1"')).toBe(true);
    expect(publicProvenanceLeakPattern.test('"contentSha256":"abc"')).toBe(
      true,
    );
    expect(publicProvenanceLeakPattern.test('"approvedAt":"2026-08-28"')).toBe(
      false,
    );
  });
});
