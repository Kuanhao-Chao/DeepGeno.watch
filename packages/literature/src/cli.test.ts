import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { main, resolveCliRoots } from "./cli.js";

const roots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("literature CLI roots", () => {
  it("resolves each new CLI root ahead of its environment variable", () => {
    expect(
      resolveCliRoots("publish", {
        flags: {
          "project-root": "cli-project",
          "state-root": "cli-state",
          root: "legacy-root",
        },
        environment: {
          DEEPGENO_PROJECT_ROOT: "env-project",
          DEEPGENO_STATE_ROOT: "env-state",
        },
        cwd: "/working-directory",
      }),
    ).toEqual({
      projectRoot: path.resolve("/working-directory", "cli-project"),
      stateRoot: path.resolve("/working-directory", "cli-state"),
    });
  });

  it("uses environment roots before the legacy local root alias", () => {
    expect(
      resolveCliRoots("publish", {
        flags: { root: "legacy-root" },
        environment: {
          DEEPGENO_PROJECT_ROOT: "env-project",
          DEEPGENO_STATE_ROOT: "env-state",
        },
        cwd: "/working-directory",
      }),
    ).toEqual({
      projectRoot: path.resolve("/working-directory", "env-project"),
      stateRoot: path.resolve("/working-directory", "env-state"),
    });
  });

  it("keeps --root as a local alias for both roots", () => {
    expect(
      resolveCliRoots("discover", {
        flags: { root: "legacy-root" },
        environment: {},
        cwd: "/working-directory",
      }),
    ).toEqual({
      projectRoot: path.resolve("/working-directory", "legacy-root"),
      stateRoot: path.resolve("/working-directory", "legacy-root"),
    });
  });

  it("fails closed in GitHub Actions when only --root is provided", () => {
    expect(() =>
      resolveCliRoots("publish", {
        flags: { root: "legacy-root" },
        environment: { GITHUB_ACTIONS: "true" },
        cwd: "/working-directory",
      }),
    ).toThrowError(expect.objectContaining({ code: "state_root_required" }));
  });

  it("rejects a state-root environment variable without an Actions flag", () => {
    expect(() =>
      resolveCliRoots("publish", {
        flags: { "project-root": "project" },
        environment: {
          GITHUB_ACTIONS: "true",
          DEEPGENO_STATE_ROOT: "private-state",
        },
        cwd: "/working-directory",
      }),
    ).toThrowError(expect.objectContaining({ code: "state_root_required" }));
  });

  it("accepts an explicit state-root flag in GitHub Actions", () => {
    expect(
      resolveCliRoots("publish", {
        flags: { "project-root": "project", "state-root": "private-state" },
        environment: { GITHUB_ACTIONS: "true" },
        cwd: "/working-directory",
      }),
    ).toEqual({
      projectRoot: path.resolve("/working-directory", "project"),
      stateRoot: path.resolve("/working-directory", "private-state"),
    });
  });

  it("loads config from project-root while reading state only from state-root", async () => {
    const stateRoot = await mkdtemp(path.join(tmpdir(), "deepgeno-cli-state-"));
    roots.push(stateRoot);
    const projectRoot = path.resolve(import.meta.dirname, "../../..");
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    await main([
      "project",
      "--project-root",
      projectRoot,
      "--state-root",
      stateRoot,
    ]);

    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      command: "project",
      publishedCount: 0,
      changedPaths: [],
    });
    expect(await readdir(stateRoot)).toEqual([]);
  });
});
