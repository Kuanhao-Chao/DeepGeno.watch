import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  validatePublicDeliveryContext,
  validatePublicDeliveryDiff,
  validatePublicDeliveryObjects,
} from "./verify-public-delivery.mjs";

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

  it.each(["100755", "120000", "160000"])(
    "rejects a non-regular delivery object mode %s",
    (mode) => {
      expect(() =>
        validatePublicDeliveryObjects({
          baseEntries: [],
          headEntries: [
            {
              mode,
              type: mode === "160000" ? "commit" : "blob",
              sha: "a".repeat(40),
              path: "content/public/papers/sealed-paper-a1b2c3d.md",
            },
          ],
          path: "content/public/papers/sealed-paper-a1b2c3d.md",
        }),
      ).toThrow(/regular blob/);
    },
  );

  it.each([
    { branch: "deepgeno/publish/nested/slug" },
    { branch: 'deepgeno/publish/x"||true||echo"' },
    { baseRef: "release" },
    { headRepository: "attacker/repo" },
  ])("rejects malformed or cross-repository delivery contexts", (change) => {
    expect(() =>
      validatePublicDeliveryContext({
        branch: "deepgeno/publish/sealed-paper-a1b2c3d",
        baseRef: "main",
        baseRepository: "example/deepgeno-watch",
        headRepository: "example/deepgeno-watch",
        expectedRepository: "example/deepgeno-watch",
        base: "a".repeat(40),
        head: "b".repeat(40),
        ...change,
      }),
    ).toThrow(/public delivery/);
  });

  it("loads the guard from the immutable PR base checkout", async () => {
    const workflow = await readFile(
      new URL("../../.github/workflows/ci.yml", import.meta.url),
      "utf8",
    );
    expect(workflow).toMatch(/DEEPGENO_GUARD_BASE_SHA:/);
    const run = workflow.match(
      /run: (node scripts\/github\/verify-public-delivery[^\n]+)/,
    )?.[1];
    expect(run).toBeDefined();
    expect(run).not.toContain("${{");
    expect(run).toContain('"$DEEPGENO_GUARD_BASE_SHA"');
    expect(workflow).not.toContain("pull_request_target");
  });

  it("executes when invoked by a relative workflow script path", async () => {
    const source = await readFile(
      new URL("./verify-public-delivery.mjs", import.meta.url),
      "utf8",
    );
    expect(source).toContain("fileURLToPath(import.meta.url)");
  });

  it.each(['deepgeno/publish/x"||true||echo"', "deepgeno/publish/nested/slug"])(
    "fails closed for an untrusted branch argument without shell evaluation: %s",
    (branch) => {
      const result = spawnSync(
        process.execPath,
        [
          path.resolve("scripts/github/verify-public-delivery.mjs"),
          "--base",
          "a".repeat(40),
          "--head",
          "b".repeat(40),
          "--branch",
          branch,
          "--base-ref",
          "main",
          "--base-repository",
          "example/deepgeno-watch",
          "--head-repository",
          "example/deepgeno-watch",
          "--repository",
          "example/deepgeno-watch",
        ],
        { encoding: "utf8" },
      );
      expect(result.status).toBe(1);
      expect(result.stdout).not.toContain("echo");
    },
  );

  it.each(["regular", "executable", "symlink", "gitlink"])(
    "uses Git objects to reject non-regular %s delivery entries",
    async (mode) => {
      const root = await mkdtemp(path.join(tmpdir(), "deepgeno-guard-"));
      try {
        git(root, ["init"]);
        git(root, ["config", "user.email", "test@example.invalid"]);
        git(root, ["config", "user.name", "Test"]);
        await writeFile(path.join(root, "README.md"), "base\n");
        git(root, ["add", "README.md"]);
        git(root, ["commit", "-m", "base"]);
        const base = git(root, ["rev-parse", "HEAD"]);
        const paper = path.join(
          root,
          "content",
          "public",
          "papers",
          "sealed-paper-a1b2c3d.md",
        );
        await mkdir(path.dirname(paper), { recursive: true });
        if (mode === "symlink") await symlink("../../README.md", paper);
        else await writeFile(paper, "sealed\n");
        if (mode === "executable") await chmod(paper, 0o755);
        if (mode === "gitlink") {
          await rm(paper, { force: true });
          git(root, [
            "update-index",
            "--add",
            "--cacheinfo",
            `160000,${base},content/public/papers/sealed-paper-a1b2c3d.md`,
          ]);
        } else
          git(root, ["add", "content/public/papers/sealed-paper-a1b2c3d.md"]);
        git(root, ["commit", "-m", mode]);
        const head = git(root, ["rev-parse", "HEAD"]);
        const result = spawnSync(
          process.execPath,
          [
            path.resolve("scripts/github/verify-public-delivery.mjs"),
            "--base",
            base,
            "--head",
            head,
            "--branch",
            "deepgeno/publish/sealed-paper-a1b2c3d",
            "--base-ref",
            "main",
            "--base-repository",
            "example/deepgeno-watch",
            "--head-repository",
            "example/deepgeno-watch",
            "--repository",
            "example/deepgeno-watch",
          ],
          { cwd: root, encoding: "utf8" },
        );
        expect(result.status).toBe(mode === "regular" ? 0 : 1);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );
});

function git(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}
