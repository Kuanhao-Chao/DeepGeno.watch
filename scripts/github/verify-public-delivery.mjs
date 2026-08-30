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

export function parseNameStatus(output) {
  if (!output || output.includes("\0"))
    throw new Error("Git diff name-status output is invalid");
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status, path, previousPath, ...extra] = line.split("\t");
      if (!status || !path || extra.length > 0)
        throw new Error("Git diff name-status output is invalid");
      return previousPath === undefined
        ? { status, path }
        : { status, path, previousPath };
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
  if (
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(base) ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(head)
  )
    throw new Error("base and head must be immutable commit SHAs");
  const result = spawnSync(
    "git",
    ["diff", "--name-status", "--find-renames", "--no-ext-diff", base, head],
    {
      encoding: "utf8",
    },
  );
  if (result.status !== 0)
    throw new Error(`git diff failed with exit ${String(result.status)}`);
  validatePublicDeliveryDiff({ branch, files: parseNameStatus(result.stdout) });
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
)
  main();
