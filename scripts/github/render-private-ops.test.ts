import {
  lstat,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const renderer = path.resolve("scripts/github/render-private-ops.mjs");
const commitA = "1234567890abcdef1234567890abcdef12345678";
const commitB = "abcdef1234567890abcdef1234567890abcdef12";
const publicRepository = "Kuanhao-Chao/DeepGeno.watch";
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("private operations renderer", () => {
  it("renders deterministic template bytes and a literal root engine lock", async () => {
    const destination = await destinationPath();
    const first = render(destination, commitA);

    expect(first.status, first.stderr).toBe(0);
    expect(
      await readFile(path.join(destination, "engine.lock.json"), "utf8"),
    ).toBe(
      `{
  "repository": "${publicRepository}",
  "commit": "${commitA}"
}\n`,
    );
    expect(await renderedStaticBytes(destination)).toEqual(
      await renderedStaticBytes(path.resolve("templates/private-ops")),
    );

    const before = await snapshot(destination);
    const second = render(destination, commitA);
    expect(second.status, second.stderr).toBe(0);
    expect(await snapshot(destination)).toEqual(before);
  });

  it.each([
    "main",
    "1234567",
    "A234567890abcdef1234567890abcdef12345678",
    "1234567890abcdef1234567890abcdef123456781234567890abcdef12345678",
    "0000000000000000000000000000000000000000",
  ])("rejects a non-literal or sentinel commit pin: %s", async (commit) => {
    const result = render(await destinationPath(), commit);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("lowercase 40-hex");
  });

  it("rejects any repository other than the fixed public engine", async () => {
    const result = render(await destinationPath(), commitA, [
      "--repository",
      "attacker/engine",
    ]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(publicRepository);
  });

  it("fails closed on static drift instead of overwriting it", async () => {
    const destination = await destinationPath();
    expect(render(destination, commitA).status).toBe(0);
    await writeFile(path.join(destination, "README.md"), "drift\n", "utf8");

    const result = render(destination, commitA);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Static template drift");
    expect(await readFile(path.join(destination, "README.md"), "utf8")).toBe(
      "drift\n",
    );
  });

  it("fails closed on extra files and symlinked static files", async () => {
    const extraDestination = await destinationPath();
    expect(render(extraDestination, commitA).status).toBe(0);
    await writeFile(path.join(extraDestination, "unexpected.txt"), "no\n");
    expect(render(extraDestination, commitA).stderr).toContain(
      "Unexpected companion path",
    );

    const symlinkDestination = await destinationPath();
    expect(render(symlinkDestination, commitA).status).toBe(0);
    const outside = path.join(roots.at(-1)!, "outside.txt");
    await writeFile(outside, "outside\n");
    await rm(path.join(symlinkDestination, "README.md"));
    await symlink(outside, path.join(symlinkDestination, "README.md"));
    const result = render(symlinkDestination, commitA);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("symlink");
    expect(await readFile(outside, "utf8")).toBe("outside\n");
  });

  it("requires an explicit repin and changes only the lock", async () => {
    const destination = await destinationPath();
    expect(render(destination, commitA).status).toBe(0);
    const staticBefore = await renderedStaticBytes(destination);

    const refused = render(destination, commitB);
    expect(refused.status).not.toBe(0);
    expect(refused.stderr).toContain("--repin");
    expect(
      await readFile(path.join(destination, "engine.lock.json"), "utf8"),
    ).toContain(commitA);

    const repinned = render(destination, commitB, ["--repin"]);
    expect(repinned.status, repinned.stderr).toBe(0);
    expect(
      await readFile(path.join(destination, "engine.lock.json"), "utf8"),
    ).toContain(commitB);
    expect(await renderedStaticBytes(destination)).toEqual(staticBefore);
  });

  it("rejects malformed, wrong-repository, and symlinked existing locks", async () => {
    const malformedDestination = await destinationPath();
    expect(render(malformedDestination, commitA).status).toBe(0);
    await writeFile(
      path.join(malformedDestination, "engine.lock.json"),
      `${JSON.stringify({ repository: publicRepository, commit: commitA, extra: true })}\n`,
    );
    expect(render(malformedDestination, commitA).stderr).toContain(
      "exactly repository and commit",
    );

    const wrongDestination = await destinationPath();
    expect(render(wrongDestination, commitA).status).toBe(0);
    await writeFile(
      path.join(wrongDestination, "engine.lock.json"),
      `${JSON.stringify({ repository: "attacker/engine", commit: commitA })}\n`,
    );
    expect(render(wrongDestination, commitA).stderr).toContain(
      publicRepository,
    );

    const symlinkDestination = await destinationPath();
    expect(render(symlinkDestination, commitA).status).toBe(0);
    const lock = path.join(symlinkDestination, "engine.lock.json");
    const outside = path.join(roots.at(-1)!, "outside-lock.json");
    await rename(lock, outside);
    await symlink(outside, lock);
    const result = render(symlinkDestination, commitA);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("symlink");
  });
});

async function destinationPath(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "deepgeno-private-ops-"));
  roots.push(root);
  return path.join(root, "state");
}

function render(destination: string, commit: string, extra: string[] = []) {
  return spawnSync(
    process.execPath,
    [renderer, "--destination", destination, "--commit", commit, ...extra],
    { encoding: "utf8" },
  );
}

async function renderedStaticBytes(
  root: string,
): Promise<Record<string, string>> {
  const paths = [
    ".github/actions/bootstrap-engine/action.yml",
    ".github/workflows/ingest.yml",
    ".github/workflows/private-ops-preflight.yml",
    ".github/workflows/summarize.yml",
    ".github/workflows/triage.yml",
    ".gitignore",
    "README.md",
    "data/private/README.md",
  ];
  return Object.fromEntries(
    await Promise.all(
      paths.map(async (relative) => [
        relative,
        await readFile(path.join(root, relative), "utf8"),
      ]),
    ),
  );
}

async function snapshot(root: string): Promise<Record<string, string>> {
  return {
    ...(await renderedStaticBytes(root)),
    "engine.lock.json": await readFile(
      path.join(root, "engine.lock.json"),
      "utf8",
    ),
  };
}
