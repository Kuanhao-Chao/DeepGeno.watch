#!/usr/bin/env node

import {
  link,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PUBLIC_ENGINE_REPOSITORY = "Kuanhao-Chao/DeepGeno.watch";
export const PRIVATE_OPS_FILES = Object.freeze([
  ".github/actions/bootstrap-engine/action.yml",
  ".github/workflows/ingest.yml",
  ".github/workflows/private-ops-preflight.yml",
  ".github/workflows/summarize.yml",
  ".github/workflows/triage.yml",
  ".gitignore",
  "README.md",
  "data/private/README.md",
]);

const modulePath = fileURLToPath(import.meta.url);
const templateRoot = path.resolve(
  path.dirname(modulePath),
  "../../templates/private-ops",
);
const allowedDirectories = new Set(
  PRIVATE_OPS_FILES.flatMap((relative) => {
    const directories = [];
    let current = path.posix.dirname(relative);
    while (current !== ".") {
      directories.push(current);
      current = path.posix.dirname(current);
    }
    return directories;
  }),
);

export async function renderPrivateOps({
  destination,
  commit,
  repository = PUBLIC_ENGINE_REPOSITORY,
  repin = false,
  syncStatic = false,
}) {
  if (typeof destination !== "string" || destination.trim() === "") {
    throw new Error("--destination must name the companion repository root");
  }
  validateRepository(repository);
  validateCommit(commit);
  await validateTemplate();

  const destinationRoot = path.resolve(destination);
  await validateDestinationAncestors(destinationRoot);
  const destinationStat = await optionalLstat(destinationRoot);
  if (!destinationStat)
    await mkdir(destinationRoot, { recursive: true, mode: 0o755 });
  const createdStat = await lstat(destinationRoot);
  if (createdStat.isSymbolicLink() || !createdStat.isDirectory()) {
    throw new Error(
      "Companion destination must be a real directory, not a symlink",
    );
  }
  if ((await realpath(destinationRoot)) !== destinationRoot) {
    throw new Error("Companion destination must resolve to its canonical path");
  }

  const tree = await inspectTree(destinationRoot, { ignoreGitMetadata: true });
  for (const directory of tree.directories) {
    if (
      !allowedDirectories.has(directory) &&
      !isPrivateRuntimePath(directory)
    ) {
      throw new Error(`Unexpected companion path: ${directory}`);
    }
  }
  for (const file of tree.files) {
    if (
      file !== "engine.lock.json" &&
      !PRIVATE_OPS_FILES.includes(file) &&
      !isPrivateRuntimePath(file)
    ) {
      throw new Error(`Unexpected companion path: ${file}`);
    }
  }

  const existingStatic = tree.files.filter((file) =>
    PRIVATE_OPS_FILES.includes(file),
  );
  const driftedStatic = await findStaticTemplateDrift(
    destinationRoot,
    existingStatic,
  );
  if (driftedStatic.length > 0 && !syncStatic) {
    throw new Error(
      `Static template drift: ${driftedStatic[0]} differs from the template`,
    );
  }

  const lockPath = path.join(destinationRoot, "engine.lock.json");
  const desiredBytes = lockBytes(commit);
  const lockStat = await optionalLstat(lockPath);
  let current;
  if (lockStat) {
    if (lockStat.isSymbolicLink()) {
      throw new Error("engine.lock.json must be a regular file, not a symlink");
    }
    if (!lockStat.isFile()) {
      throw new Error("engine.lock.json must be a regular file");
    }

    const currentBytes = await readFile(lockPath, "utf8");
    current = parseLock(currentBytes);
    if (currentBytes !== lockBytes(current.commit)) {
      throw new Error("engine.lock.json drift: expected deterministic bytes");
    }
    if (current.commit !== commit && !repin) {
      throw new Error(
        `Engine pin is ${current.commit}; pass --repin to change it to ${commit}`,
      );
    }
  }

  const missingStatic = PRIVATE_OPS_FILES.filter(
    (relative) => !existingStatic.includes(relative),
  );
  await copyStaticTemplate(destinationRoot, missingStatic);
  if (syncStatic) {
    await replaceStaticTemplate(destinationRoot, driftedStatic);
  }

  if (!current) {
    await createFileAtomic(lockPath, desiredBytes, destinationRoot);
    return {
      destination: destinationRoot,
      repository,
      commit,
      repinned: false,
      synced: driftedStatic.length > 0,
    };
  }
  if (current.commit === commit) {
    return {
      destination: destinationRoot,
      repository,
      commit,
      repinned: false,
      synced: driftedStatic.length > 0,
    };
  }
  await replaceFileAtomic(lockPath, desiredBytes, destinationRoot);
  return {
    destination: destinationRoot,
    repository,
    commit,
    repinned: true,
    synced: driftedStatic.length > 0,
  };
}

function validateRepository(repository) {
  if (repository !== PUBLIC_ENGINE_REPOSITORY) {
    throw new Error(`Repository must be exactly ${PUBLIC_ENGINE_REPOSITORY}`);
  }
}

function validateCommit(commit) {
  if (
    typeof commit !== "string" ||
    !/^[0-9a-f]{40}$/.test(commit) ||
    /^([0-9a-f])\1{39}$/.test(commit)
  ) {
    throw new Error("Commit must be a non-sentinel lowercase 40-hex object ID");
  }
}

function lockBytes(commit) {
  return `${JSON.stringify(
    { repository: PUBLIC_ENGINE_REPOSITORY, commit },
    null,
    2,
  )}\n`;
}

function parseLock(bytes) {
  let lock;
  try {
    lock = JSON.parse(bytes);
  } catch {
    throw new Error("engine.lock.json must contain valid JSON");
  }
  if (!lock || Array.isArray(lock) || typeof lock !== "object") {
    throw new Error("engine.lock.json must be an object");
  }
  const keys = Object.keys(lock).sort();
  if (keys.join(",") !== "commit,repository") {
    throw new Error(
      "engine.lock.json must contain exactly repository and commit",
    );
  }
  validateRepository(lock.repository);
  validateCommit(lock.commit);
  return lock;
}

async function validateTemplate() {
  const stat = await optionalLstat(templateRoot);
  if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("Private operations template must be a real directory");
  }
  const tree = await inspectTree(templateRoot);
  if (
    tree.files.join("\n") !== PRIVATE_OPS_FILES.join("\n") ||
    tree.directories.some((directory) => !allowedDirectories.has(directory))
  ) {
    throw new Error("Private operations template does not match its allowlist");
  }
}

async function copyStaticTemplate(destinationRoot, missingStatic) {
  for (const relative of missingStatic) {
    const source = path.join(templateRoot, relative);
    const target = path.join(destinationRoot, relative);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o755 });
    const bytes = await readFile(source);
    await createFileAtomic(target, bytes, destinationRoot);
  }
}

async function findStaticTemplateDrift(destinationRoot, existingStatic) {
  const drifted = [];
  for (const relative of existingStatic) {
    const target = path.join(destinationRoot, relative);
    const stat = await lstat(target);
    if (stat.isSymbolicLink()) {
      throw new Error(`Static template drift: ${relative} is a symlink`);
    }
    if (!stat.isFile()) {
      throw new Error(
        `Static template drift: ${relative} is not a regular file`,
      );
    }
    const [expected, actual] = await Promise.all([
      readFile(path.join(templateRoot, relative)),
      readFile(target),
    ]);
    if (!expected.equals(actual)) {
      drifted.push(relative);
    }
  }
  return drifted;
}

async function replaceStaticTemplate(destinationRoot, driftedStatic) {
  for (const relative of driftedStatic) {
    const source = path.join(templateRoot, relative);
    const target = path.join(destinationRoot, relative);
    const bytes = await readFile(source);
    await replaceFileAtomic(target, bytes, destinationRoot);
  }
}

function isPrivateRuntimePath(relative) {
  return (
    relative.startsWith("data/private/") &&
    relative !== "data/private/README.md"
  );
}

async function inspectTree(root, { ignoreGitMetadata = false } = {}) {
  const files = [];
  const directories = [];

  async function visit(relative) {
    const entries = await readdir(path.join(root, relative), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const child = path.posix.join(relative, entry.name);
      if (ignoreGitMetadata && relative === "" && entry.name === ".git") {
        const gitStat = await lstat(path.join(root, child));
        if (gitStat.isSymbolicLink() || !gitStat.isDirectory()) {
          throw new Error(
            "Git metadata must be a real directory, not a symlink or special file",
          );
        }
        await assertRegularTree(path.join(root, child), child);
        continue;
      }
      const stat = await lstat(path.join(root, child));
      if (stat.isSymbolicLink()) {
        throw new Error(`Companion path must not be a symlink: ${child}`);
      }
      if (stat.isDirectory()) {
        directories.push(child);
        await visit(child);
      } else if (stat.isFile()) {
        files.push(child);
      } else {
        throw new Error(
          `Companion path must be a regular file or directory: ${child}`,
        );
      }
    }
  }

  await visit("");
  return { files: files.sort(), directories: directories.sort() };
}

async function assertRegularTree(root, relativeRoot) {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    const relative = path.posix.join(relativeRoot, entry.name);
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink()) {
      throw new Error(`Git metadata must not contain a symlink: ${relative}`);
    }
    if (stat.isDirectory()) {
      await assertRegularTree(absolute, relative);
    } else if (!stat.isFile()) {
      throw new Error(
        `Git metadata must contain only regular files and directories: ${relative}`,
      );
    }
  }
}

async function optionalLstat(target) {
  try {
    return await lstat(target);
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

async function validateDestinationAncestors(destinationRoot) {
  const parsed = path.parse(destinationRoot);
  const segments = destinationRoot
    .slice(parsed.root.length)
    .split(path.sep)
    .filter(Boolean);
  let current = parsed.root;
  for (const segment of segments) {
    current = path.join(current, segment);
    const stat = await optionalLstat(current);
    if (!stat) break;
    if (stat.isSymbolicLink()) {
      throw new Error(
        `Companion destination ancestor must not be a symlink: ${current}`,
      );
    }
    if (!stat.isDirectory()) {
      throw new Error(
        `Companion destination ancestor must be a directory: ${current}`,
      );
    }
  }
}

async function createFileAtomic(target, bytes, destinationRoot) {
  const temporary = temporaryPath(destinationRoot);
  await writeFile(temporary, bytes, {
    mode: 0o644,
    flag: "wx",
  });
  try {
    await link(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function replaceFileAtomic(target, bytes, destinationRoot) {
  const temporary = temporaryPath(destinationRoot);
  await writeFile(temporary, bytes, {
    mode: 0o644,
    flag: "wx",
  });
  try {
    await rename(temporary, target);
  } catch (error) {
    try {
      await rm(temporary, { force: true });
    } catch {
      // Preserve the original rename error.
    }
    throw error;
  }
}

function temporaryPath(destinationRoot) {
  return path.join(
    path.dirname(destinationRoot),
    `.deepgeno-private-ops-${process.pid}-${randomUUID()}.tmp`,
  );
}

function parseArguments(args) {
  const options = {
    destination: undefined,
    commit: undefined,
    repository: PUBLIC_ENGINE_REPOSITORY,
    repin: false,
    syncStatic: false,
  };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--repin") {
      if (seen.has(argument))
        throw new Error("--repin may be supplied only once");
      seen.add(argument);
      options.repin = true;
      continue;
    }
    if (argument === "--sync-static") {
      if (seen.has(argument))
        throw new Error("--sync-static may be supplied only once");
      seen.add(argument);
      options.syncStatic = true;
      continue;
    }
    if (!["--destination", "--commit", "--repository"].includes(argument)) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    if (seen.has(argument))
      throw new Error(`${argument} may be supplied only once`);
    seen.add(argument);
    const value = args[index + 1];
    if (value === undefined) throw new Error(`${argument} requires a value`);
    index += 1;
    if (argument === "--destination") options.destination = value;
    if (argument === "--commit") options.commit = value;
    if (argument === "--repository") options.repository = value;
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  try {
    const result = await renderPrivateOps(
      parseArguments(process.argv.slice(2)),
    );
    process.stdout.write(
      `${result.repinned ? "Repinned" : result.synced ? "Synced" : "Rendered"} private operations at ${result.destination}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
