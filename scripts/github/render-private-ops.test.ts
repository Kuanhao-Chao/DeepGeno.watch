import {
  access,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
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

  it("preserves arbitrary regular private runtime bytes across rerun and repin", async () => {
    const destination = await destinationPath();
    expect(render(destination, commitA).status).toBe(0);
    const nested = path.join(
      destination,
      "data/private/deliveries/nested/runtime.bin",
    );
    const rootState = path.join(destination, "data/private/state.json");
    await mkdir(path.dirname(nested), { recursive: true });
    await writeFile(nested, Buffer.from([0, 255, 10, 13, 42]));
    await writeFile(rootState, '{"private":true}\n', "utf8");
    const before = await runtimeBytes(destination, [nested, rootState]);

    expect(render(destination, commitA).status).toBe(0);
    expect(await runtimeBytes(destination, [nested, rootState])).toEqual(
      before,
    );
    expect(render(destination, commitB, ["--repin"]).status).toBe(0);
    expect(await runtimeBytes(destination, [nested, rootState])).toEqual(
      before,
    );
  });

  it("recovers an exact interrupted static copy and fills only missing files", async () => {
    const destination = await destinationPath();
    const partial = [".gitignore", ".github/workflows/ingest.yml"];
    for (const relative of partial) {
      const target = path.join(destination, relative);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(path.resolve("templates/private-ops", relative), target);
    }

    const result = render(destination, commitA);

    expect(result.status, result.stderr).toBe(0);
    expect(await renderedStaticBytes(destination)).toEqual(
      await renderedStaticBytes(path.resolve("templates/private-ops")),
    );
  });

  it("validates all partial static bytes before creating any missing file", async () => {
    const destination = await destinationPath();
    await mkdir(destination, { recursive: true });
    await copyFile(
      path.resolve("templates/private-ops/.gitignore"),
      path.join(destination, ".gitignore"),
    );
    await writeFile(path.join(destination, "README.md"), "drift\n");
    const missing = path.join(
      destination,
      ".github/actions/bootstrap-engine/action.yml",
    );

    const result = render(destination, commitA);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Static template drift");
    await expect(access(missing)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("validates an existing lock before recovering a partial skeleton", async () => {
    const destination = await destinationPath();
    await mkdir(destination, { recursive: true });
    await copyFile(
      path.resolve("templates/private-ops/.gitignore"),
      path.join(destination, ".gitignore"),
    );
    const drift = `{"repository":"${publicRepository}","commit":"${commitA}"}\n`;
    await writeFile(path.join(destination, "engine.lock.json"), drift, "utf8");
    const missing = path.join(
      destination,
      ".github/actions/bootstrap-engine/action.yml",
    );

    const result = render(destination, commitB, ["--repin"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("deterministic bytes");
    await expect(access(missing)).rejects.toMatchObject({ code: "ENOENT" });
    expect(
      await readFile(path.join(destination, "engine.lock.json"), "utf8"),
    ).toBe(drift);
  });

  it("rejects noncanonical existing lock bytes before repinning", async () => {
    const destination = await destinationPath();
    expect(render(destination, commitA).status).toBe(0);
    const lock = path.join(destination, "engine.lock.json");
    const drift = `{"repository":"${publicRepository}","commit":"${commitA}","commit":"${commitA}"}\n`;
    await writeFile(lock, drift, "utf8");

    const result = render(destination, commitB, ["--repin"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("deterministic bytes");
    expect(await readFile(lock, "utf8")).toBe(drift);
  });

  it("rejects an existing symlink destination and a missing leaf below a symlink", async () => {
    const existingRoot = await temporaryRoot();
    const existingReal = path.join(existingRoot, "real");
    const existingLink = path.join(existingRoot, "state-link");
    await mkdir(existingReal);
    await symlink(existingReal, existingLink);

    const existing = render(existingLink, commitA);
    expect(existing.status).not.toBe(0);
    expect(existing.stderr).toContain("symlink");
    await expect(
      access(path.join(existingReal, "engine.lock.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });

    const missingRoot = await temporaryRoot();
    const missingReal = path.join(missingRoot, "real-parent");
    const missingLink = path.join(missingRoot, "linked-parent");
    await mkdir(missingReal);
    await symlink(missingReal, missingLink);
    const missingDestination = path.join(missingLink, "state");

    const missing = render(missingDestination, commitA);
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain("ancestor must not be a symlink");
    await expect(access(path.join(missingReal, "state"))).rejects.toMatchObject(
      {
        code: "ENOENT",
      },
    );
  });

  it("rejects special files in private runtime state and Git metadata", async () => {
    const runtimeDestination = await destinationPath();
    expect(render(runtimeDestination, commitA).status).toBe(0);
    const runtimePipe = path.join(
      runtimeDestination,
      "data/private/runtime.pipe",
    );
    const runtimeMkfifo = spawnSync("mkfifo", [runtimePipe], {
      encoding: "utf8",
    });
    expect(runtimeMkfifo.status, runtimeMkfifo.stderr).toBe(0);
    const runtime = render(runtimeDestination, commitA);
    expect(runtime.status).not.toBe(0);
    expect(runtime.stderr).toContain("regular file or directory");

    const gitDestination = await destinationPath();
    expect(render(gitDestination, commitA).status).toBe(0);
    const gitPipe = path.join(gitDestination, ".git");
    const gitMkfifo = spawnSync("mkfifo", [gitPipe], { encoding: "utf8" });
    expect(gitMkfifo.status, gitMkfifo.stderr).toBe(0);
    const git = render(gitDestination, commitA);
    expect(git.status).not.toBe(0);
    expect(git.stderr).toContain("Git metadata must be a real directory");
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
  const root = await temporaryRoot();
  return path.join(root, "state");
}

async function temporaryRoot(): Promise<string> {
  const canonicalTemp = await realpath(tmpdir());
  const root = await mkdtemp(path.join(canonicalTemp, "deepgeno-private-ops-"));
  roots.push(root);
  return root;
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

async function runtimeBytes(
  root: string,
  absolutePaths: string[],
): Promise<Record<string, Buffer>> {
  return Object.fromEntries(
    await Promise.all(
      absolutePaths.map(async (absolute) => [
        path.relative(root, absolute),
        await readFile(absolute),
      ]),
    ),
  );
}
