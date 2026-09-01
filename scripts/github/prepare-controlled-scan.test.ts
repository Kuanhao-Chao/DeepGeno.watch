import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = path.resolve("scripts/github/prepare-controlled-scan.mjs");
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("controlled scan private handoff", () => {
  it("applies every known decision and defers an unknown candidate", async () => {
    const stateRoot = await privateStateRoot();
    const manifestPath = "data/private/activation/controlled-scan.json";
    const reviewPath = "data/private/reviews/candidate-inbox.md";
    const outputPath = "data/private/reviews/candidate-inbox-controlled.md";
    const deferrals = [
      "2222222222222222",
      "3333333333333333",
      "4444444444444444",
      "5555555555555555",
      "6666666666666666",
      "7777777777777777",
      "8888888888888888",
      "9999999999999999",
      "aaaaaaaaaaaaaaaa",
    ];
    const dismissals = [
      "bbbbbbbbbbbbbbbb",
      "cccccccccccccccc",
      "dddddddddddddddd",
      "eeeeeeeeeeeeeeee",
    ];
    await writePrivateJson(stateRoot, manifestPath, {
      schemaVersion: "1.0",
      unknownCandidateAction: "defer",
      decisions: [
        { paperId: "paper-1111111111111111", action: "summarize" },
        ...deferrals.map((paperId) => ({ paperId, action: "defer" })),
        ...dismissals.map((paperId) => ({ paperId, action: "dismiss" })),
      ],
    });
    await writePrivateText(
      stateRoot,
      reviewPath,
      candidateReview([
        "paper-1111111111111111",
        ...deferrals.map((fingerprint) => `paper-${fingerprint}`),
        ...dismissals.map((fingerprint) => `paper-${fingerprint}`),
        "paper-ffffffffffffffff",
      ]),
    );

    const result = runScript(stateRoot, manifestPath, reviewPath, outputPath, [
      "--expect-summarize",
      "1",
      "--expect-defer",
      "9",
      "--expect-dismiss",
      "4",
    ]);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      "known plan 1 summarize / 9 defer / 4 dismiss",
    );
    expect(result.stdout).toContain("1 unknown candidate deferred");
    expect(
      selectedActions(await readFile(path.join(stateRoot, outputPath), "utf8")),
    ).toEqual({
      "paper-1111111111111111": "summarize",
      "paper-2222222222222222": "defer",
      "paper-3333333333333333": "defer",
      "paper-4444444444444444": "defer",
      "paper-5555555555555555": "defer",
      "paper-6666666666666666": "defer",
      "paper-7777777777777777": "defer",
      "paper-8888888888888888": "defer",
      "paper-9999999999999999": "defer",
      "paper-aaaaaaaaaaaaaaaa": "defer",
      "paper-bbbbbbbbbbbbbbbb": "dismiss",
      "paper-cccccccccccccccc": "dismiss",
      "paper-dddddddddddddddd": "dismiss",
      "paper-eeeeeeeeeeeeeeee": "dismiss",
      "paper-ffffffffffffffff": "defer",
    });

    const replay = runScript(stateRoot, manifestPath, reviewPath, outputPath, [
      "--expect-summarize",
      "1",
      "--expect-defer",
      "9",
      "--expect-dismiss",
      "4",
    ]);
    expect(replay.status, replay.stderr).toBe(0);
  });

  it("normalizes private 16-hex fingerprints to generated paper IDs", async () => {
    const stateRoot = await privateStateRoot();
    const manifestPath = "data/private/activation/controlled-scan.json";
    const reviewPath = "data/private/reviews/candidate-inbox.md";
    const outputPath = "data/private/reviews/candidate-inbox-controlled.md";
    await writePrivateJson(stateRoot, manifestPath, {
      schemaVersion: "1.0",
      unknownCandidateAction: "defer",
      decisions: [
        { paperId: "paper-aaaaaaaaaaaaaaaa", action: "summarize" },
        { paperId: "bbbbbbbbbbbbbbbb", action: "defer" },
        { paperId: "cccccccccccccccc", action: "dismiss" },
      ],
    });
    await writePrivateText(
      stateRoot,
      reviewPath,
      candidateReview([
        "paper-aaaaaaaaaaaaaaaa",
        "paper-bbbbbbbbbbbbbbbb",
        "paper-cccccccccccccccc",
      ]),
    );

    const result = runScript(stateRoot, manifestPath, reviewPath, outputPath, [
      "--expect-summarize",
      "1",
      "--expect-defer",
      "1",
      "--expect-dismiss",
      "1",
    ]);

    expect(result.status, result.stderr).toBe(0);
    expect(
      selectedActions(await readFile(path.join(stateRoot, outputPath), "utf8")),
    ).toEqual({
      "paper-aaaaaaaaaaaaaaaa": "summarize",
      "paper-bbbbbbbbbbbbbbbb": "defer",
      "paper-cccccccccccccccc": "dismiss",
    });
  });

  it("stops without an output body when the selected paper is absent", async () => {
    const stateRoot = await privateStateRoot();
    const manifestPath = "data/private/activation/controlled-scan.json";
    const reviewPath = "data/private/reviews/candidate-inbox.md";
    const outputPath = "data/private/reviews/candidate-inbox-controlled.md";
    await writePrivateJson(stateRoot, manifestPath, {
      schemaVersion: "1.0",
      unknownCandidateAction: "defer",
      decisions: [
        { paperId: "paper-aaaaaaaaaaaaaaaa", action: "summarize" },
        { paperId: "bbbbbbbbbbbbbbbb", action: "defer" },
        { paperId: "cccccccccccccccc", action: "dismiss" },
      ],
    });
    await writePrivateText(
      stateRoot,
      reviewPath,
      candidateReview([
        "paper-bbbbbbbbbbbbbbbb",
        "paper-cccccccccccccccc",
        "paper-dddddddddddddddd",
      ]),
    );

    const result = runScript(stateRoot, manifestPath, reviewPath, outputPath, [
      "--expect-summarize",
      "1",
      "--expect-defer",
      "1",
      "--expect-dismiss",
      "1",
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Selected summarize paper is absent; stop before synthesis",
    );
    await expect(
      readFile(path.join(stateRoot, outputPath), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a manifest that does not contain the expected 1/9/4 plan", async () => {
    const stateRoot = await privateStateRoot();
    const manifestPath = "data/private/activation/controlled-scan.json";
    const reviewPath = "data/private/reviews/candidate-inbox.md";
    const outputPath = "data/private/reviews/candidate-inbox-controlled.md";
    const summarize = "paper-a000000000000000";
    const deferrals = [
      "b000000000000001",
      "b000000000000002",
      "b000000000000003",
      "b000000000000004",
      "b000000000000005",
      "b000000000000006",
      "b000000000000007",
      "b000000000000008",
    ];
    const dismissals = [
      "c000000000000001",
      "c000000000000002",
      "c000000000000003",
      "c000000000000004",
    ];
    await writePrivateJson(stateRoot, manifestPath, {
      schemaVersion: "1.0",
      unknownCandidateAction: "defer",
      decisions: [
        { paperId: summarize, action: "summarize" },
        ...deferrals.map((paperId) => ({ paperId, action: "defer" })),
        ...dismissals.map((paperId) => ({ paperId, action: "dismiss" })),
      ],
    });
    await writePrivateText(
      stateRoot,
      reviewPath,
      candidateReview([
        summarize,
        ...deferrals.map((fingerprint) => `paper-${fingerprint}`),
        ...dismissals.map((fingerprint) => `paper-${fingerprint}`),
      ]),
    );

    const result = runScript(stateRoot, manifestPath, reviewPath, outputPath, [
      "--expect-summarize",
      "1",
      "--expect-defer",
      "9",
      "--expect-dismiss",
      "4",
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Controlled-scan manifest expected 9 defer decision(s), found 8",
    );
    await expect(
      readFile(path.join(stateRoot, outputPath), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects private input symlinks and never writes an output", async () => {
    const stateRoot = await privateStateRoot();
    const outsideRoot = await mkdtemp(
      path.join(tmpdir(), "deepgeno-controlled-outside-"),
    );
    roots.push(outsideRoot);
    const manifestPath = "data/private/activation/controlled-scan.json";
    const reviewPath = "data/private/reviews/candidate-inbox.md";
    const outputPath = "data/private/reviews/candidate-inbox-controlled.md";
    const outsideManifest = path.join(outsideRoot, "manifest.json");
    await mkdir(path.dirname(path.join(stateRoot, manifestPath)), {
      recursive: true,
    });
    await writeFile(
      outsideManifest,
      JSON.stringify({
        schemaVersion: "1.0",
        unknownCandidateAction: "defer",
        decisions: [],
      }),
      "utf8",
    );
    await symlink(outsideManifest, path.join(stateRoot, manifestPath));
    await writePrivateText(
      stateRoot,
      reviewPath,
      candidateReview(["paper-aaaaaaaaaaaaaaaa"]),
    );

    const result = runScript(stateRoot, manifestPath, reviewPath, outputPath, [
      "--expect-summarize",
      "1",
      "--expect-defer",
      "0",
      "--expect-dismiss",
      "0",
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Controlled-scan manifest must be a regular private file, not a symlink",
    );
    await expect(
      readFile(path.join(stateRoot, outputPath), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});

async function privateStateRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "deepgeno-controlled-scan-"));
  roots.push(root);
  const result = spawnSync("git", ["init"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  const remote = spawnSync(
    "git",
    [
      "remote",
      "add",
      "origin",
      "https://github.com/Kuanhao-Chao/DeepGeno.watch-state.git",
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (remote.status !== 0) throw new Error(remote.stderr);
  return root;
}

async function writePrivateJson(
  stateRoot: string,
  relativePath: string,
  value: unknown,
): Promise<void> {
  await writePrivateText(stateRoot, relativePath, `${JSON.stringify(value)}\n`);
}

async function writePrivateText(
  stateRoot: string,
  relativePath: string,
  value: string,
): Promise<void> {
  const target = path.join(stateRoot, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, value, "utf8");
}

function runScript(
  stateRoot: string,
  manifestPath: string,
  reviewPath: string,
  outputPath: string,
  extraArguments: string[] = [],
) {
  return spawnSync(
    process.execPath,
    [
      script,
      "--state-root",
      stateRoot,
      "--manifest",
      manifestPath,
      "--review",
      reviewPath,
      "--output",
      outputPath,
      ...extraArguments,
    ],
    { encoding: "utf8" },
  );
}

function candidateReview(paperIds: string[]): string {
  return [
    "# Candidate inbox",
    '<!-- deepgeno:candidate-batch id="batch-1" revision="1" -->',
    "",
    ...paperIds.flatMap((paperId, index) => [
      `## ${index + 1}. Fixture paper`,
      `<!-- deepgeno:candidate id="candidate-${paperId}" revision="1" -->`,
      "<!-- deepgeno:decision:start -->",
      "",
      "- [ ] Summarize",
      "- [ ] Defer 7 days",
      "- [ ] Dismiss",
      "",
      "<!-- deepgeno:decision:end -->",
      "Fixture metadata",
    ]),
    "",
  ].join("\n");
}

function selectedActions(body: string): Record<string, string> {
  const result: Record<string, string> = {};
  const marker =
    /<!-- deepgeno:candidate id="candidate-(paper-[A-Za-z0-9._-]+)" revision="\d+" -->/g;
  const matches = [...body.matchAll(marker)];
  for (const [index, match] of matches.entries()) {
    const block = body.slice(match.index, matches[index + 1]?.index);
    const checked = [
      ["summarize", /^\s*- \[[xX]\] Summarize\s*$/m],
      ["defer", /^\s*- \[[xX]\] Defer 7 days\s*$/m],
      ["dismiss", /^\s*- \[[xX]\] Dismiss\s*$/m],
    ].filter(([, pattern]) => (pattern as RegExp).test(block));
    if (checked.length !== 1)
      throw new Error(`Invalid fixture block: ${block}`);
    result[match[1]!] = checked[0]![0] as string;
  }
  return result;
}
