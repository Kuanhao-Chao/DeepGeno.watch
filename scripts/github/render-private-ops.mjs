#!/usr/bin/env node

import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
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
}) {
  if (typeof destination !== "string" || destination.trim() === "") {
    throw new Error("--destination must name the companion repository root");
  }
  validateRepository(repository);
  validateCommit(commit);
  await validateTemplate();

  const destinationRoot = path.resolve(destination);
  const destinationStat = await optionalLstat(destinationRoot);
  if (destinationStat?.isSymbolicLink()) {
    throw new Error("Companion destination must not be a symlink");
  }
  if (destinationStat && !destinationStat.isDirectory()) {
    throw new Error("Companion destination must be a directory");
  }
  if (!destinationStat)
    await mkdir(destinationRoot, { recursive: true, mode: 0o755 });

  const tree = await inspectTree(destinationRoot, { ignoreGitMetadata: true });
  for (const directory of tree.directories) {
    if (!allowedDirectories.has(directory)) {
      throw new Error(`Unexpected companion path: ${directory}`);
    }
  }
  for (const file of tree.files) {
    if (file !== "engine.lock.json" && !PRIVATE_OPS_FILES.includes(file)) {
      throw new Error(`Unexpected companion path: ${file}`);
    }
  }

  const existingStatic = tree.files.filter((file) =>
    PRIVATE_OPS_FILES.includes(file),
  );
  if (existingStatic.length === 0) {
    await copyStaticTemplate(destinationRoot);
  } else {
    if (existingStatic.length !== PRIVATE_OPS_FILES.length) {
      throw new Error(
        "Static template drift: the companion skeleton is incomplete",
      );
    }
    await assertStaticTemplateMatches(destinationRoot);
  }

  const lockPath = path.join(destinationRoot, "engine.lock.json");
  const desiredBytes = lockBytes(commit);
  const lockStat = await optionalLstat(lockPath);
  if (!lockStat) {
    await writeFile(lockPath, desiredBytes, {
      encoding: "utf8",
      mode: 0o644,
      flag: "wx",
    });
    return {
      destination: destinationRoot,
      repository,
      commit,
      repinned: false,
    };
  }
  if (lockStat.isSymbolicLink()) {
    throw new Error("engine.lock.json must be a regular file, not a symlink");
  }
  if (!lockStat.isFile()) {
    throw new Error("engine.lock.json must be a regular file");
  }

  const currentBytes = await readFile(lockPath, "utf8");
  const current = parseLock(currentBytes);
  if (current.commit === commit) {
    if (currentBytes !== desiredBytes) {
      throw new Error("engine.lock.json drift: expected deterministic bytes");
    }
    return {
      destination: destinationRoot,
      repository,
      commit,
      repinned: false,
    };
  }
  if (!repin) {
    throw new Error(
      `Engine pin is ${current.commit}; pass --repin to change it to ${commit}`,
    );
  }
  await writeAtomic(lockPath, desiredBytes);
  return { destination: destinationRoot, repository, commit, repinned: true };
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

async function copyStaticTemplate(destinationRoot) {
  for (const relative of PRIVATE_OPS_FILES) {
    const source = path.join(templateRoot, relative);
    const target = path.join(destinationRoot, relative);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o755 });
    const bytes = await readFile(source);
    await writeFile(target, bytes, { mode: 0o644, flag: "wx" });
  }
}

async function assertStaticTemplateMatches(destinationRoot) {
  for (const relative of PRIVATE_OPS_FILES) {
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
      throw new Error(
        `Static template drift: ${relative} differs from the template`,
      );
    }
  }
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
        if (gitStat.isSymbolicLink()) {
          throw new Error("Companion .git metadata must not be a symlink");
        }
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

async function optionalLstat(target) {
  try {
    return await lstat(target);
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

async function writeAtomic(target, bytes) {
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, bytes, {
    encoding: "utf8",
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

function parseArguments(args) {
  const options = {
    destination: undefined,
    commit: undefined,
    repository: PUBLIC_ENGINE_REPOSITORY,
    repin: false,
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
      `${result.repinned ? "Repinned" : "Rendered"} private operations at ${result.destination}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
