#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function validatePublicDeliveryDiff({ branch, files }) {
  const match = /^deepgeno\/publish\/([a-z0-9][a-z0-9-]*)$/.exec(branch);
  if (!match) return false;
  const expectedPath = `content/public/papers/${match[1]}.md`;
  if (
    !Array.isArray(files) ||
    files.length !== 1 ||
    files[0]?.status !== "A" ||
    files[0]?.path !== expectedPath ||
    files[0]?.previousPath !== undefined
  ) {
    throw new Error(
      `Public delivery ${branch} must add exactly one added sealed path: ${expectedPath}`,
    );
  }
  return true;
}

export function validatePublicDeliveryContext({
  branch,
  baseRef,
  baseRepository,
  headRepository,
  expectedRepository,
  base,
  head,
}) {
  if (!/^deepgeno\/publish\/[a-z0-9][a-z0-9-]*$/.test(branch))
    throw new Error("public delivery branch is invalid");
  if (baseRef !== "main") throw new Error("public delivery base must be main");
  if (
    baseRepository !== expectedRepository ||
    headRepository !== expectedRepository
  ) {
    throw new Error("public delivery must use same-repository branches");
  }
  if (!isSha(base) || !isSha(head))
    throw new Error(
      "public delivery base and head must be immutable commit SHAs",
    );
}

export function parseNameStatus(output) {
  const fields = output.split("\0");
  if (fields.pop() !== "")
    throw new Error("Git diff name-status output is invalid");
  const files = [];
  while (fields.length > 0) {
    const status = fields.shift();
    if (!status) throw new Error("Git diff name-status output is invalid");
    if (/^[RC]\d+$/.test(status)) {
      const previousPath = fields.shift();
      const path = fields.shift();
      if (!previousPath || !path)
        throw new Error("Git diff name-status output is invalid");
      files.push({ status, path, previousPath });
      continue;
    }
    const path = fields.shift();
    if (!/^[A-Z]+$/.test(status) || !path)
      throw new Error("Git diff name-status output is invalid");
    files.push({ status, path });
  }
  return files;
}

export function validatePublicDeliveryObjects({
  baseEntries,
  headEntries,
  path,
}) {
  if (
    !Array.isArray(baseEntries) ||
    !Array.isArray(headEntries) ||
    baseEntries.length !== 0
  )
    throw new Error("public delivery base must not contain the sealed path");
  if (
    headEntries.length !== 1 ||
    headEntries[0]?.path !== path ||
    headEntries[0]?.mode !== "100644" ||
    headEntries[0]?.type !== "blob" ||
    !isSha(headEntries[0]?.sha)
  ) {
    throw new Error("public delivery head must contain one regular blob");
  }
}

export function parseLsTree(output) {
  const entries = output.split("\0");
  if (entries.pop() !== "") throw new Error("Git ls-tree output is invalid");
  return entries.map((entry) => {
    const tab = entry.indexOf("\t");
    const [mode, type, sha, ...extra] = entry.slice(0, tab).split(" ");
    const path = entry.slice(tab + 1);
    if (tab < 1 || !mode || !type || !sha || extra.length > 0 || !path)
      throw new Error("Git ls-tree output is invalid");
    return { mode, type, sha, path };
  });
}

function argument(name) {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (!value || value.startsWith("-")) throw new Error(`${name} is required`);
  return value;
}

function main() {
  const base = argument("--base");
  const head = argument("--head");
  const branch = argument("--branch");
  validatePublicDeliveryContext({
    branch,
    baseRef: argument("--base-ref"),
    baseRepository: argument("--base-repository"),
    headRepository: argument("--head-repository"),
    expectedRepository: argument("--repository"),
    base,
    head,
  });
  const result = spawnSync(
    "git",
    [
      "diff",
      "--name-status",
      "-z",
      "--find-renames",
      "--no-ext-diff",
      base,
      head,
    ],
    {
      encoding: "utf8",
    },
  );
  if (result.status !== 0)
    throw new Error(`git diff failed with exit ${String(result.status)}`);
  if (
    !validatePublicDeliveryDiff({
      branch,
      files: parseNameStatus(result.stdout),
    })
  )
    throw new Error("public delivery branch is invalid");
  const path = `content/public/papers/${branch.slice("deepgeno/publish/".length)}.md`;
  validatePublicDeliveryObjects({
    baseEntries: lsTree(base, path),
    headEntries: lsTree(head, path),
    path,
  });
}

function lsTree(ref, path) {
  const result = spawnSync("git", ["ls-tree", "-z", ref, "--", path], {
    encoding: "utf8",
  });
  if (result.status !== 0)
    throw new Error(`git ls-tree failed with exit ${String(result.status)}`);
  return parseLsTree(result.stdout);
}

function isSha(value) {
  return /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value);
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
)
  main();
