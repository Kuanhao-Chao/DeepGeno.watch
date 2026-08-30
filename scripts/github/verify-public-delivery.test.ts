import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { validatePublicDeliveryDiff } from "./verify-public-delivery.mjs";

describe("trusted public delivery CI guard", () => {
  it("permits exactly one added sealed path for its deterministic branch", () => {
    expect(
      validatePublicDeliveryDiff({
        branch: "deepgeno/publish/sealed-paper-a1b2c3d",
        files: [
          {
            status: "A",
            path: "content/public/papers/sealed-paper-a1b2c3d.md",
          },
        ],
      }),
    ).toBe(true);
  });

  it.each([
    [{ status: "M", path: "content/public/papers/sealed-paper-a1b2c3d.md" }],
    [
      {
        status: "R100",
        path: "content/public/papers/sealed-paper-a1b2c3d.md",
        previousPath: "old.md",
      },
    ],
    [{ status: "A", path: "content/public/papers/other.md" }],
    [
      { status: "A", path: "content/public/papers/sealed-paper-a1b2c3d.md" },
      { status: "A", path: "README.md" },
    ],
  ])("rejects non-additive or out-of-scope delivery changes", (files) => {
    expect(() =>
      validatePublicDeliveryDiff({
        branch: "deepgeno/publish/sealed-paper-a1b2c3d",
        files,
      }),
    ).toThrow(/exactly one added/);
  });

  it("leaves non-delivery pull requests supported", () => {
    expect(
      validatePublicDeliveryDiff({ branch: "feature/docs", files: [] }),
    ).toBe(false);
  });

  it("loads the guard from the immutable PR base checkout", async () => {
    const workflow = await readFile(
      new URL("../../.github/workflows/ci.yml", import.meta.url),
      "utf8",
    );
    expect(workflow).toMatch(
      /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/,
    );
    expect(workflow).toMatch(/verify-public-delivery\.mjs --base/);
    expect(workflow).not.toContain("pull_request_target");
  });

  it("executes when invoked by a relative workflow script path", async () => {
    const source = await readFile(
      new URL("./verify-public-delivery.mjs", import.meta.url),
      "utf8",
    );
    expect(source).toContain("fileURLToPath(import.meta.url)");
  });
});
