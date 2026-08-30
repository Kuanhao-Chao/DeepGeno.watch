import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  assertPrivateRepository,
  assertMergedByCurator,
  assertPrivateStateCheckout,
  automationWorkingDirectory,
  buildLiteratureInvocation,
  executeApprovedPublication,
  executeStagedDiscovery,
  extractReviewId,
  parseJsonLine,
  privateGhArguments,
  relevantPullRequestKind,
  resolveAutomationRoots,
  resolveDiscoveryWindows,
  validateChangedPaths,
  validateModelEnvironment,
  validateSelectedPaperLimit,
} from "./workflow-lib.mjs";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("GitHub literature workflow boundaries", () => {
  it("imports automation without running a command and exposes its entrypoint for testing", async () => {
    const automation = await import("./automation.mjs");
    expect(typeof automation.main).toBe("function");
  });

  it("rejects review automation in a public repository", () => {
    expect(() =>
      assertPrivateRepository({ repository: { private: false } }),
    ).toThrow(/private GitHub repository/);
  });

  it("recognizes exactly one review label", () => {
    expect(
      relevantPullRequestKind({
        pull_request: { labels: [{ name: "literature-inbox" }] },
      }),
    ).toBe("candidate");
    expect(() =>
      relevantPullRequestKind({
        pull_request: {
          labels: [{ name: "literature-inbox" }, { name: "summary-review" }],
        },
      }),
    ).toThrow(/cannot carry both/);
  });

  it("requires one unambiguous immutable marker", () => {
    expect(
      extractReviewId(
        '<!-- deepgeno:candidate-batch id="batch-1" revision="2" -->',
        "candidate",
      ),
    ).toEqual({ id: "batch-1", revision: 2 });
    expect(() =>
      extractReviewId(
        '<!-- deepgeno:draft id="draft-1" revision="1" -->\n<!-- deepgeno:draft id="draft-2" revision="1" -->',
        "summary",
      ),
    ).toThrow(/exactly one/);
  });

  it("chunks a bounded 90-day backfill without gaps", () => {
    expect(
      resolveDiscoveryWindows({
        backfillDays: 90,
        now: new Date("2026-08-27T16:00:00Z"),
        maxWindowDays: 30,
      }),
    ).toEqual([
      { from: "2026-05-30", through: "2026-06-28" },
      { from: "2026-06-29", through: "2026-07-28" },
      { from: "2026-07-29", through: "2026-08-27" },
    ]);
  });

  it("uses the Los Angeles calendar date for scheduled discovery", () => {
    expect(
      resolveDiscoveryWindows({ now: new Date("2026-08-28T05:00:00Z") }),
    ).toEqual([{ from: "2026-08-27", through: "2026-08-27" }]);
  });

  it("confines mutation paths to explicitly allowed projections", () => {
    expect(
      validateChangedPaths(["data/private/batches/a.json"], ["data/private/"]),
    ).toEqual(["data/private/batches/a.json"]);
    expect(() =>
      validateChangedPaths(
        ["apps/web/src/pages/index.astro"],
        ["data/private/"],
      ),
    ).toThrow(/out-of-scope/);
    expect(() =>
      validateChangedPaths(["../secret"], ["data/private/"]),
    ).toThrow(/Unsafe relative path/);
  });

  it("selects one configured model provider without fallback", () => {
    expect(
      validateModelEnvironment({
        DEEPGENO_MODEL_PROVIDER: "openai",
        DEEPGENO_MODEL_NAME: "explicit-model",
        OPENAI_API_KEY: "test-key",
      }),
    ).toEqual({
      provider: "openai",
      model: "explicit-model",
      selectedKey: "OPENAI_API_KEY",
      maxOutputTokens: 5000,
    });
    expect(() =>
      validateModelEnvironment({
        DEEPGENO_MODEL_PROVIDER: "openai",
        DEEPGENO_MODEL_NAME: "explicit-model",
        ANTHROPIC_API_KEY: "wrong-key",
      }),
    ).toThrow(/OPENAI_API_KEY/);
  });

  it("bounds summary fan-out before any model jobs start", () => {
    expect(validateSelectedPaperLimit(["paper-1", "paper-2"], "2")).toBe(2);
    expect(() =>
      validateSelectedPaperLimit(["paper-1", "paper-2"], "1"),
    ).toThrow(/exceeding the per-run limit/);
    expect(() => validateSelectedPaperLimit(["paper-1"], "0")).toThrow(
      /integer from 1/,
    );
  });

  it("parses only the expected CLI result object", () => {
    expect(
      parseJsonLine(
        'npm note\n{"command":"discover","candidateCount":2}\n',
        "discover",
      ),
    ).toMatchObject({ candidateCount: 2 });
    expect(() => parseJsonLine('{"command":"publish"}', "discover")).toThrow(
      /Expected literature command/,
    );
  });

  it("requires distinct explicit engine and state roots in GitHub Actions", () => {
    expect(
      resolveAutomationRoots(
        {
          GITHUB_ACTIONS: "true",
          DEEPGENO_PROJECT_ROOT: "/checkout/engine",
          DEEPGENO_STATE_ROOT: "/checkout/private-state",
        },
        "/fallback",
      ),
    ).toEqual({
      projectRoot: "/checkout/engine",
      stateRoot: "/checkout/private-state",
    });
    expect(() =>
      resolveAutomationRoots(
        { GITHUB_ACTIONS: "true", DEEPGENO_PROJECT_ROOT: "/checkout/engine" },
        "/fallback",
      ),
    ).toThrow(/DEEPGENO_STATE_ROOT/);
    expect(() =>
      resolveAutomationRoots(
        {
          GITHUB_ACTIONS: "true",
          DEEPGENO_PROJECT_ROOT: "/checkout/same",
          DEEPGENO_STATE_ROOT: "/checkout/same",
        },
        "/fallback",
      ),
    ).toThrow(/distinct/);
  });

  it("builds every literature invocation with literal split roots and the engine cwd", () => {
    const roots = {
      projectRoot: "/checkout/engine",
      stateRoot: "/checkout/private-state",
    };
    expect(
      buildLiteratureInvocation("discover", ["--from", "2026-08-28"], roots),
    ).toEqual({
      command: "npm",
      args: [
        "run",
        "--silent",
        "literature",
        "--",
        "discover",
        "--project-root",
        "/checkout/engine",
        "--state-root",
        "/checkout/private-state",
        "--from",
        "2026-08-28",
      ],
      cwd: "/checkout/engine",
    });
    expect(automationWorkingDirectory("npm", roots)).toBe("/checkout/engine");
    expect(automationWorkingDirectory("build", roots)).toBe("/checkout/engine");
    expect(automationWorkingDirectory("privacy", roots)).toBe(
      "/checkout/engine",
    );
    expect(automationWorkingDirectory("git", roots)).toBe(
      "/checkout/private-state",
    );
    expect(automationWorkingDirectory("gh", roots)).toBe(
      "/checkout/private-state",
    );
  });

  it("requires the configured curator to be the exact normalized merge actor", () => {
    const event = {
      pull_request: { merged_by: { login: "Genome-Curator" } },
    };
    expect(assertMergedByCurator(event, " genome-curator ")).toBe(
      "Genome-Curator",
    );
    expect(() => assertMergedByCurator(event, "another-curator")).toThrow(
      /configured curator/,
    );
    expect(() => assertMergedByCurator(event, " ")).toThrow(
      /DEEPGENO_CURATOR_GITHUB_LOGIN/,
    );
  });

  it("binds private automation to the exact real private checkout and event origin", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "deepgeno-checkout-test-"));
    roots.push(root);
    const projectRoot = path.join(root, "engine");
    const stateRoot = path.join(root, "state");
    await mkdir(projectRoot);
    await mkdir(stateRoot);
    git(stateRoot, ["init"]);
    git(stateRoot, [
      "remote",
      "add",
      "origin",
      "https://github.com/example/private-state.git",
    ]);
    const event = { repository: { full_name: "example/private-state" } };

    await expect(
      assertPrivateStateCheckout({ roots: { projectRoot, stateRoot }, event }),
    ).resolves.toMatchObject({ repository: "example/private-state" });
    git(stateRoot, [
      "remote",
      "set-url",
      "--push",
      "origin",
      "https://github.com/example/attacker.git",
    ]);
    await expect(
      assertPrivateStateCheckout({ roots: { projectRoot, stateRoot }, event }),
    ).rejects.toThrow(/effective origin/);
    git(stateRoot, [
      "remote",
      "set-url",
      "--delete",
      "--push",
      "origin",
      "https://github.com/example/attacker.git",
    ]);
    git(stateRoot, [
      "remote",
      "set-url",
      "--add",
      "origin",
      "https://github.com/example/private-state.git",
    ]);
    await expect(
      assertPrivateStateCheckout({ roots: { projectRoot, stateRoot }, event }),
    ).rejects.toThrow(/effective origin/);
    git(stateRoot, ["remote", "remove", "origin"]);
    git(stateRoot, [
      "remote",
      "add",
      "origin",
      "https://github.com/example/private-state.git",
    ]);
    git(stateRoot, [
      "remote",
      "set-url",
      "origin",
      "https://github.com/Example/private-state.git",
    ]);
    await expect(
      assertPrivateStateCheckout({ roots: { projectRoot, stateRoot }, event }),
    ).rejects.toThrow(/effective origin/);
    git(stateRoot, [
      "remote",
      "set-url",
      "origin",
      "https://github.com/example/private-state.git",
    ]);
    const nestedRoot = path.join(stateRoot, "nested");
    await mkdir(nestedRoot);
    await expect(
      assertPrivateStateCheckout({
        roots: { projectRoot, stateRoot: nestedRoot },
        event,
      }),
    ).rejects.toThrow(/checkout root/);
    git(stateRoot, [
      "remote",
      "set-url",
      "origin",
      "https://github.com/example/wrong.git",
    ]);
    await expect(
      assertPrivateStateCheckout({ roots: { projectRoot, stateRoot }, event }),
    ).rejects.toThrow(/origin does not match/);
    git(stateRoot, ["remote", "remove", "origin"]);
    await expect(
      assertPrivateStateCheckout({ roots: { projectRoot, stateRoot }, event }),
    ).rejects.toThrow(/effective origin/);
    git(stateRoot, [
      "remote",
      "add",
      "origin",
      "https://github.com/example/private-state.git",
    ]);
    const linked = path.join(root, "linked-state");
    await symlink(stateRoot, linked);
    await expect(
      assertPrivateStateCheckout({
        roots: { projectRoot, stateRoot: linked },
        event,
      }),
    ).rejects.toThrow(/symlink/);
  });

  it("pins every private gh invocation to the event repository", () => {
    expect(privateGhArguments("example/private-state", ["pr", "list"])).toEqual(
      ["pr", "list", "--repo", "example/private-state"],
    );
    expect(privateGhArguments("Example/private-state", ["pr", "list"])).toEqual(
      ["pr", "list", "--repo", "Example/private-state"],
    );
  });

  it("rechecks the private destination before state and review pushes", async () => {
    const source = await readFile(
      new URL("./automation.mjs", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(
      /await assertPrivateStateRemote\(\{\s*stateRoot: roots\.stateRoot,/,
    );
    expect(source).toMatch(/privateGh\(\[\s*"pr",\s*"list"/);
    expect(source).toMatch(/privateGh\(\[\s*"label",\s*"create"/);
  });

  it("runs shadow discovery in a disposable copy without mutating or accepting real state", async () => {
    const fixture = await stagedFixture();
    let accepted = 0;

    const reports = await executeStagedDiscovery({
      stateRoot: fixture.stateRoot,
      runnerTemp: fixture.runnerTemp,
      shadow: true,
      discover: async (stagedStateRoot: string) => {
        await writePrivateMutation(stagedStateRoot, "shadow-only");
        return [
          {
            changedPaths: ["data/private/checkpoints/source.json"],
            sourceIssues: [
              { source: "fixture", code: "partial", message: "partial" },
            ],
          },
        ];
      },
      accept: async () => {
        accepted += 1;
      },
    });

    expect(reports[0]!.sourceIssues).toHaveLength(1);
    expect(accepted).toBe(0);
    expect(await readFile(fixture.markerPath, "utf8")).toBe("original");
    expect(await readdir(fixture.runnerTemp)).toEqual([]);
  });

  it("rejects non-shadow source issues before real-state mutation or Gate 1 acceptance", async () => {
    const fixture = await stagedFixture();
    let accepted = 0;

    await expect(
      executeStagedDiscovery({
        stateRoot: fixture.stateRoot,
        runnerTemp: fixture.runnerTemp,
        shadow: false,
        discover: async (stagedStateRoot: string) => {
          await writePrivateMutation(stagedStateRoot, "must-not-promote");
          return [
            {
              changedPaths: ["data/private/checkpoints/source.json"],
              sourceIssues: [
                {
                  source: "fixture",
                  code: "source_unavailable",
                  message: "unavailable",
                },
              ],
            },
          ];
        },
        accept: async () => {
          accepted += 1;
        },
      }),
    ).rejects.toThrow(/source issue/);

    expect(accepted).toBe(0);
    expect(await readFile(fixture.markerPath, "utf8")).toBe("original");
    expect(await readdir(fixture.runnerTemp)).toEqual([]);
  });

  it("promotes only validated private paths after a clean discovery", async () => {
    const fixture = await stagedFixture();
    let acceptedValue = "";

    await executeStagedDiscovery({
      stateRoot: fixture.stateRoot,
      runnerTemp: fixture.runnerTemp,
      shadow: false,
      discover: async (stagedStateRoot: string) => {
        await writePrivateMutation(stagedStateRoot, "promoted");
        return [
          {
            changedPaths: ["data/private/checkpoints/source.json"],
            sourceIssues: [],
          },
        ];
      },
      accept: async () => {
        acceptedValue = await readFile(fixture.markerPath, "utf8");
      },
    });

    expect(acceptedValue).toBe("promoted");
    expect(await readFile(fixture.markerPath, "utf8")).toBe("promoted");
    expect(await readdir(fixture.runnerTemp)).toEqual([]);
  });

  it("keeps public CI while removing all public operational workflows", async () => {
    const workflowRoot = path.resolve(
      import.meta.dirname,
      "../../.github/workflows",
    );
    expect((await readdir(workflowRoot)).sort()).toEqual(["ci.yml"]);
  });

  it("persists pending state before public delivery and persists the receipt afterward", async () => {
    const events: string[] = [];
    let privateRemoteState = "";

    const result = await executeApprovedPublication({
      publish: async () => {
        events.push("seal-pending");
        return { slug: "paper-slug", changedPaths: ["pending.json"] };
      },
      commitPending: async (publication: { changedPaths: string[] }) => {
        expect(publication.changedPaths).toEqual(["pending.json"]);
        privateRemoteState = "pending";
        events.push("push-pending");
      },
      verifyProject: async () => {
        expect(privateRemoteState).toBe("pending");
        events.push("verify-project");
      },
      deliver: async (slug: string) => {
        expect(slug).toBe("paper-slug");
        expect(privateRemoteState).toBe("pending");
        events.push("public-request");
        return {
          state: "pr-open",
          pullRequestUrl: "https://github.com/example/public/pull/1",
          changedPaths: ["receipt.json"],
        };
      },
      commitReceipt: async (delivery: { changedPaths: string[] }) => {
        expect(delivery.changedPaths).toEqual(["receipt.json"]);
        privateRemoteState = "pr-open";
        events.push("push-receipt");
      },
    });

    expect(events).toEqual([
      "seal-pending",
      "push-pending",
      "verify-project",
      "public-request",
      "push-receipt",
    ]);
    expect(privateRemoteState).toBe("pr-open");
    expect(result.delivery.pullRequestUrl).toContain("/pull/1");
  });
});

async function stagedFixture(): Promise<{
  stateRoot: string;
  runnerTemp: string;
  markerPath: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "deepgeno-workflow-test-"));
  roots.push(root);
  const stateRoot = path.join(root, "state");
  const runnerTemp = path.join(root, "runner");
  const markerPath = path.join(
    stateRoot,
    "data",
    "private",
    "checkpoints",
    "source.json",
  );
  await mkdir(path.dirname(markerPath), { recursive: true });
  await mkdir(runnerTemp, { recursive: true });
  await writeFile(markerPath, "original", "utf8");
  return { stateRoot, runnerTemp, markerPath };
}

async function writePrivateMutation(
  stateRoot: string,
  value: string,
): Promise<void> {
  const target = path.join(
    stateRoot,
    "data",
    "private",
    "checkpoints",
    "source.json",
  );
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, value, "utf8");
}

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${(result.stderr || result.stdout || "").trim()}`,
    );
  }
}
