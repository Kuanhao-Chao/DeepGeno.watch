#!/usr/bin/env node

import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertPrivateStateCheckout,
  validateRelativePath,
} from "./workflow-lib.mjs";

const STATE_REPOSITORY = "Kuanhao-Chao/DeepGeno.watch-state";
const PRIVATE_PREFIX = "data/private/";
const modulePath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(import.meta.dirname, "../..");
const candidateMarker =
  /<!-- deepgeno:candidate id="([A-Za-z0-9._-]+)" revision="(\d+)" -->/g;
const paperIdPattern = /^paper-[A-Za-z0-9][A-Za-z0-9._-]*$/;
const paperFingerprintPattern = /^[a-f0-9]{16}$/;
const actions = ["summarize", "defer", "dismiss"];

export function compileControlledScan({
  manifest,
  reviewBody,
  expectedCounts,
}) {
  const plan = validateManifest(manifest, expectedCounts);
  if (typeof reviewBody !== "string" || reviewBody.length === 0) {
    throw new Error("Candidate review body must be non-empty text");
  }
  const markers = [...reviewBody.matchAll(candidateMarker)];
  if (markers.length === 0) {
    throw new Error("Candidate review body has no candidate markers");
  }

  const seenCandidates = new Set();
  const appliedKnown = emptyCounts();
  const finalCounts = emptyCounts();
  let unknownDeferred = 0;
  let selectedPresent = false;
  let cursor = 0;
  let compiled = "";

  for (const [index, marker] of markers.entries()) {
    const start = marker.index;
    const end = markers[index + 1]?.index ?? reviewBody.length;
    const candidateId = marker[1];
    const paperId = candidateId?.startsWith("candidate-")
      ? candidateId.slice("candidate-".length)
      : undefined;
    if (!paperId || !paperIdPattern.test(paperId)) {
      throw new Error("Candidate review contains a noncanonical paper marker");
    }
    if (seenCandidates.has(paperId)) {
      throw new Error("Candidate review contains duplicate candidate markers");
    }
    seenCandidates.add(paperId);

    const knownAction = plan.get(paperId);
    const action = knownAction ?? "defer";
    if (knownAction) {
      appliedKnown[knownAction] += 1;
      if (knownAction === "summarize") selectedPresent = true;
    } else {
      unknownDeferred += 1;
    }
    finalCounts[action] += 1;

    compiled += reviewBody.slice(cursor, start);
    compiled += selectCandidateAction(reviewBody.slice(start, end), action);
    cursor = end;
  }
  compiled += reviewBody.slice(cursor);

  if (!selectedPresent) {
    throw new Error(
      "Selected summarize paper is absent; stop before synthesis",
    );
  }

  return {
    reviewBody: compiled,
    report: {
      plannedKnown: { ...expectedCounts },
      appliedKnown,
      missingKnown: {
        summarize: expectedCounts.summarize - appliedKnown.summarize,
        defer: expectedCounts.defer - appliedKnown.defer,
        dismiss: expectedCounts.dismiss - appliedKnown.dismiss,
      },
      unknownDeferred,
      final: finalCounts,
    },
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const roots = await assertPrivateStateCheckout({
    roots: { projectRoot, stateRoot: options.stateRoot },
    event: { repository: { full_name: STATE_REPOSITORY } },
  });
  const manifestPath = await privateInputPath(
    roots.stateRoot,
    options.manifest,
    "Controlled-scan manifest",
  );
  const reviewPath = await privateInputPath(
    roots.stateRoot,
    options.review,
    "Candidate review",
  );
  const outputPath = await privateOutputPath(roots.stateRoot, options.output);
  if (new Set([manifestPath, reviewPath, outputPath]).size !== 3) {
    throw new Error("Manifest, review, and output paths must be distinct");
  }

  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Controlled-scan manifest must be valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const result = compileControlledScan({
    manifest,
    reviewBody: await readFile(reviewPath, "utf8"),
    expectedCounts: options.expectedCounts,
  });
  await writeExactPrivateFile(outputPath, result.reviewBody);

  const { plannedKnown, missingKnown, unknownDeferred } = result.report;
  process.stdout.write(
    [
      `Prepared private Gate 1 body with known plan ${plannedKnown.summarize} summarize / ${plannedKnown.defer} defer / ${plannedKnown.dismiss} dismiss.`,
      `${unknownDeferred} unknown candidate${unknownDeferred === 1 ? "" : "s"} deferred for seven days.`,
      `Missing known non-selected papers: ${missingKnown.defer} defer / ${missingKnown.dismiss} dismiss.`,
      `Private output: ${options.output}`,
    ].join("\n") + "\n",
  );
}

function validateManifest(manifest, expectedCounts) {
  validateCounts(expectedCounts);
  if (!isPlainObject(manifest)) {
    throw new Error("Controlled-scan manifest must be a JSON object");
  }
  assertExactKeys(manifest, [
    "schemaVersion",
    "unknownCandidateAction",
    "decisions",
  ]);
  if (manifest.schemaVersion !== "1.0") {
    throw new Error("Controlled-scan manifest schemaVersion must be 1.0");
  }
  if (manifest.unknownCandidateAction !== "defer") {
    throw new Error("Unknown controlled-scan candidates must be deferred");
  }
  if (!Array.isArray(manifest.decisions)) {
    throw new Error("Controlled-scan manifest decisions must be an array");
  }

  const plan = new Map();
  const counts = emptyCounts();
  for (const decision of manifest.decisions) {
    if (!isPlainObject(decision)) {
      throw new Error("Each controlled-scan decision must be an object");
    }
    assertExactKeys(decision, ["paperId", "action"]);
    const paperId = normalizePaperId(decision.paperId);
    if (!actions.includes(decision.action)) {
      throw new Error("Controlled-scan decision action is invalid");
    }
    if (plan.has(paperId)) {
      throw new Error("Controlled-scan manifest contains a duplicate paper ID");
    }
    plan.set(paperId, decision.action);
    counts[decision.action] += 1;
  }
  for (const action of actions) {
    if (counts[action] !== expectedCounts[action]) {
      throw new Error(
        `Controlled-scan manifest expected ${expectedCounts[action]} ${action} decision(s), found ${counts[action]}`,
      );
    }
  }
  return plan;
}

function normalizePaperId(value) {
  if (paperIdPattern.test(value)) return value;
  if (paperFingerprintPattern.test(value)) return `paper-${value}`;
  throw new Error(
    "Controlled-scan decisions require paper IDs or 16-hex paper fingerprints",
  );
}

function selectCandidateAction(block, selectedAction) {
  const startMarker = "<!-- deepgeno:decision:start -->";
  const endMarker = "<!-- deepgeno:decision:end -->";
  const start = block.indexOf(startMarker);
  const end = block.indexOf(endMarker);
  if (
    start < 0 ||
    end < start ||
    start !== block.lastIndexOf(startMarker) ||
    end !== block.lastIndexOf(endMarker)
  ) {
    throw new Error("Candidate review has malformed decision delimiters");
  }
  const regionStart = start + startMarker.length;
  let region = block.slice(regionStart, end);
  const labels = {
    summarize: "Summarize",
    defer: "Defer 7 days",
    dismiss: "Dismiss",
  };
  for (const action of actions) {
    const label = labels[action];
    const pattern = new RegExp(
      `^([ \\t]*)- \\[[ xX]\\] ${escapeRegex(label)}[ \\t]*$`,
      "gm",
    );
    if ([...region.matchAll(pattern)].length !== 1) {
      throw new Error("Candidate review has malformed decision choices");
    }
    region = region.replace(
      pattern,
      `$1- [${action === selectedAction ? "x" : " "}] ${label}`,
    );
  }
  return block.slice(0, regionStart) + region + block.slice(end);
}

function parseArguments(argv) {
  const values = new Map();
  const allowed = new Set([
    "--state-root",
    "--manifest",
    "--review",
    "--output",
    "--expect-summarize",
    "--expect-defer",
    "--expect-dismiss",
  ]);
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(name))
      throw new Error(`Unknown argument: ${String(name)}`);
    if (values.has(name)) throw new Error(`${name} may be supplied only once`);
    if (value === undefined) throw new Error(`${name} requires a value`);
    values.set(name, value);
  }
  for (const name of allowed) {
    if (!values.has(name)) throw new Error(`${name} is required`);
  }
  return {
    stateRoot: values.get("--state-root"),
    manifest: values.get("--manifest"),
    review: values.get("--review"),
    output: values.get("--output"),
    expectedCounts: {
      summarize: integerArgument(values.get("--expect-summarize")),
      defer: integerArgument(values.get("--expect-defer")),
      dismiss: integerArgument(values.get("--expect-dismiss")),
    },
  };
}

async function privateInputPath(stateRoot, relativePath, label) {
  const target = privatePath(stateRoot, relativePath);
  let metadata;
  try {
    metadata = await lstat(target);
  } catch {
    throw new Error(`${label} must be an existing regular private file`);
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${label} must be a regular private file, not a symlink`);
  }
  const canonical = await realpath(target);
  assertInside(stateRoot, canonical);
  return canonical;
}

async function privateOutputPath(stateRoot, relativePath) {
  const target = privatePath(stateRoot, relativePath);
  const parent = await realpath(path.dirname(target)).catch(() => undefined);
  if (!parent) {
    throw new Error("Controlled-scan output directory must already exist");
  }
  assertInside(stateRoot, parent);
  try {
    const metadata = await lstat(target);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(
        "Controlled-scan output must be a regular private file, not a symlink",
      );
    }
    assertInside(stateRoot, await realpath(target));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return target;
}

function privatePath(stateRoot, relativePath) {
  const normalized = validateRelativePath(relativePath);
  if (!normalized.startsWith(PRIVATE_PREFIX)) {
    throw new Error("Controlled-scan paths must remain under data/private");
  }
  const target = path.resolve(stateRoot, normalized);
  assertInside(stateRoot, target);
  return target;
}

function assertInside(root, target) {
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new Error("Controlled-scan path escapes the private state root");
  }
}

async function writeExactPrivateFile(target, contents) {
  try {
    await writeFile(target, contents, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    return;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  const existing = await readFile(target, "utf8");
  if (existing !== contents) {
    throw new Error(
      "Controlled-scan output already exists with different bytes",
    );
  }
}

function validateCounts(counts) {
  if (!isPlainObject(counts)) {
    throw new Error("Expected controlled-scan counts are required");
  }
  assertExactKeys(counts, actions);
  for (const action of actions) {
    if (!Number.isSafeInteger(counts[action]) || counts[action] < 0) {
      throw new Error(
        `Expected ${action} count must be a non-negative integer`,
      );
    }
  }
  if (counts.summarize !== 1) {
    throw new Error("A controlled scan must select exactly one paper");
  }
}

function integerArgument(value) {
  if (!/^(?:0|[1-9]\d*)$/.test(value)) {
    throw new Error("Expected counts must be non-negative integers");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error("Expected counts must be safe integers");
  }
  return parsed;
}

function emptyCounts() {
  return { summarize: 0, defer: 0, dismiss: 0 };
}

function assertExactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw new Error(
      "Controlled-scan manifest contains unknown or missing fields",
    );
  }
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
