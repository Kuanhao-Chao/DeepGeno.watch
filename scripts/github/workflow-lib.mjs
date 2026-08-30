import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  dirname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
} from "node:path";

export const CANDIDATE_LABEL = "literature-inbox";
export const SUMMARY_LABEL = "summary-review";
export const PRIVATE_PREFIX = "data/private/";
export const PUBLIC_PAPER_PREFIX = "content/public/papers/";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CANDIDATE_BATCH_MARKER =
  /<!-- deepgeno:candidate-batch id="([A-Za-z0-9._-]+)" revision="(\d+)" -->/g;
const DRAFT_MARKER =
  /<!-- deepgeno:draft id="([A-Za-z0-9._-]+)" revision="(\d+)" -->/g;

export async function readEvent(path) {
  if (!path) throw new Error("GITHUB_EVENT_PATH is required");
  return JSON.parse(await readFile(path, "utf8"));
}

export function assertPrivateRepository(event) {
  if (event?.repository?.private !== true) {
    throw new Error(
      "Literature automation is restricted to a private GitHub repository because review bodies contain private abstracts and drafts.",
    );
  }
}

export function assertMergedByCurator(event, configuredLogin) {
  const expected = normalizedLogin(configuredLogin);
  if (!expected) {
    throw new Error(
      "DEEPGENO_CURATOR_GITHUB_LOGIN must name the curator allowed to merge literature reviews",
    );
  }
  const actualValue = event?.pull_request?.merged_by?.login;
  const actual = normalizedLogin(actualValue);
  if (!actual || actual !== expected) {
    throw new Error(
      "Merged literature review was not attributed to the configured curator",
    );
  }
  return actualValue.trim();
}

export function resolveAutomationRoots(
  environment = process.env,
  cwd = process.cwd(),
) {
  const projectValue = optionalRoot(environment.DEEPGENO_PROJECT_ROOT);
  const stateValue = optionalRoot(environment.DEEPGENO_STATE_ROOT);
  if (environment.GITHUB_ACTIONS === "true") {
    if (!projectValue)
      throw new Error(
        "DEEPGENO_PROJECT_ROOT is required in GitHub Actions",
      );
    if (!stateValue)
      throw new Error("DEEPGENO_STATE_ROOT is required in GitHub Actions");
  }
  const projectRoot = resolve(cwd, projectValue ?? cwd);
  const stateRoot = resolve(cwd, stateValue ?? cwd);
  if (
    environment.GITHUB_ACTIONS === "true" &&
    projectRoot === stateRoot
  ) {
    throw new Error(
      "DEEPGENO_PROJECT_ROOT and DEEPGENO_STATE_ROOT must be distinct in GitHub Actions",
    );
  }
  return { projectRoot, stateRoot };
}

export function buildLiteratureInvocation(
  command,
  args,
  roots,
  stateRoot = roots.stateRoot,
) {
  return {
    command: "npm",
    args: [
      "run",
      "--silent",
      "literature",
      "--",
      command,
      "--project-root",
      roots.projectRoot,
      "--state-root",
      resolve(stateRoot),
      ...args,
    ],
    cwd: roots.projectRoot,
  };
}

export function automationWorkingDirectory(kind, roots) {
  if (new Set(["npm", "literature", "build", "privacy"]).has(kind))
    return roots.projectRoot;
  if (new Set(["git", "gh", "review"]).has(kind)) return roots.stateRoot;
  throw new Error(`Unknown automation tool kind: ${String(kind)}`);
}

/**
 * Runs discovery against a disposable private-state copy. A clean non-shadow
 * result is promoted atomically by allowlisted path before Gate 1 side effects;
 * shadow results and partial-source results never touch the real state root.
 */
export async function executeStagedDiscovery({
  stateRoot,
  runnerTemp,
  shadow,
  discover,
  accept,
}) {
  const actualRoot = resolve(stateRoot);
  const temporaryParent = resolve(runnerTemp);
  await mkdir(temporaryParent, { recursive: true });
  const stagedStateRoot = await mkdtemp(
    join(temporaryParent, "discovery-state-"),
  );
  try {
    await copyPrivateState(actualRoot, stagedStateRoot);
    const reports = await discover(stagedStateRoot);
    if (!Array.isArray(reports))
      throw new Error("Staged discovery must return an array of reports");
    const sourceIssueCount = reports.reduce((count, report) => {
      if (!Array.isArray(report?.sourceIssues))
        throw new Error("sourceIssues must be an array");
      return count + report.sourceIssues.length;
    }, 0);
    if (shadow) return reports;
    if (sourceIssueCount > 0) {
      throw new Error(
        `Non-shadow discovery stopped because ${sourceIssueCount} source issue(s) were reported`,
      );
    }
    const changedPaths = validateChangedPaths(
      reports.flatMap((report) => report.changedPaths),
      [PRIVATE_PREFIX],
    );
    await promotePrivatePaths(stagedStateRoot, actualRoot, changedPaths);
    await accept(reports);
    return reports;
  } finally {
    await removeStagedRoot(temporaryParent, stagedStateRoot);
  }
}

export async function executeApprovedPublication({
  publish,
  commitPending,
  verifyProject,
  deliver,
  commitReceipt,
}) {
  const publication = await publish();
  await commitPending(publication);
  await verifyProject();
  const delivery = await deliver(publication.slug);
  await commitReceipt(delivery);
  return { publication, delivery };
}

export function relevantPullRequestKind(event) {
  const labels = new Set(
    (event?.pull_request?.labels ?? []).map((label) =>
      typeof label === "string" ? label : label?.name,
    ),
  );
  const candidate = labels.has(CANDIDATE_LABEL);
  const summary = labels.has(SUMMARY_LABEL);
  if (candidate && summary) {
    throw new Error(
      `A pull request cannot carry both ${CANDIDATE_LABEL} and ${SUMMARY_LABEL}`,
    );
  }
  if (candidate) return "candidate";
  if (summary) return "summary";
  return undefined;
}

export function pullRequestMetadata(event) {
  const pullRequest = event?.pull_request;
  if (!pullRequest)
    throw new Error("This command requires a pull_request event");
  return {
    body: pullRequest.body ?? "",
    url: pullRequest.html_url,
    merged: pullRequest.merged === true,
    mergedAt: pullRequest.merged_at,
    mergeCommitSha: pullRequest.merge_commit_sha,
    actorId: pullRequest.merged_by?.login,
    actorName: pullRequest.merged_by?.name ?? pullRequest.merged_by?.login,
    updatedAt: pullRequest.updated_at,
  };
}

export function extractReviewId(body, kind) {
  const pattern = kind === "candidate" ? CANDIDATE_BATCH_MARKER : DRAFT_MARKER;
  pattern.lastIndex = 0;
  const matches = [...body.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one ${kind === "candidate" ? "candidate batch" : "draft"} marker; found ${matches.length}`,
    );
  }
  return { id: matches[0][1], revision: Number(matches[0][2]) };
}

export function parseJsonLine(output, expectedCommand) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let value;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      value = JSON.parse(lines[index]);
      break;
    } catch {
      // npm and child tools may emit informational lines; the CLI contract is the
      // final JSON object, so continue scanning without trusting those lines.
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Literature CLI did not emit a JSON object");
  }
  if (expectedCommand && value.command !== expectedCommand) {
    throw new Error(
      `Expected literature command ${expectedCommand}; received ${String(value.command)}`,
    );
  }
  return value;
}

export function validateChangedPaths(paths, allowedPrefixes) {
  if (!Array.isArray(paths)) throw new Error("changedPaths must be an array");
  return [...new Set(paths.map(validateRelativePath))].map((path) => {
    if (!allowedPrefixes.some((prefix) => path.startsWith(prefix))) {
      throw new Error(`Automation refused an out-of-scope path: ${path}`);
    }
    return path;
  });
}

export function validateRelativePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new Error("Expected a non-empty relative path");
  }
  const normalized = posix.normalize(value.replaceAll("\\", "/"));
  if (
    isAbsolute(value) ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    throw new Error(`Unsafe relative path: ${value}`);
  }
  return normalized;
}

export function validateModelEnvironment(environment) {
  const provider = environment.DEEPGENO_MODEL_PROVIDER;
  const model = environment.DEEPGENO_MODEL_NAME?.trim();
  if (provider !== "openai" && provider !== "anthropic") {
    throw new Error(
      "DEEPGENO_MODEL_PROVIDER must be explicitly set to openai or anthropic",
    );
  }
  if (!model)
    throw new Error("DEEPGENO_MODEL_NAME must be explicitly configured");
  const selectedKey =
    provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
  if (!environment[selectedKey]?.trim()) {
    throw new Error(`${selectedKey} is required for the selected provider`);
  }
  const maxOutputTokens = boundedInteger(
    environment.DEEPGENO_MODEL_MAX_OUTPUT_TOKENS || "5000",
    "DEEPGENO_MODEL_MAX_OUTPUT_TOKENS",
    512,
    20_000,
  );
  return { provider, model, selectedKey, maxOutputTokens };
}

export function validateSelectedPaperLimit(paperIds, configuredLimit = "20") {
  if (
    !Array.isArray(paperIds) ||
    paperIds.some((value) => typeof value !== "string" || !value)
  ) {
    throw new Error("Selected paper IDs must be non-empty strings");
  }
  const limit = boundedInteger(
    configuredLimit || "20",
    "DEEPGENO_MAX_SUMMARIES_PER_RUN",
    1,
    100,
  );
  if (paperIds.length > limit) {
    throw new Error(
      `Gate 1 selected ${paperIds.length} papers, exceeding the per-run limit of ${limit}`,
    );
  }
  return limit;
}

export function resolveDiscoveryWindows({
  from,
  through,
  backfillDays = 0,
  now = new Date(),
  timeZone = "America/Los_Angeles",
  maxWindowDays = 30,
} = {}) {
  const parsedBackfillDays = Number(backfillDays || 0);
  if (
    !Number.isInteger(parsedBackfillDays) ||
    parsedBackfillDays < 0 ||
    parsedBackfillDays > 90
  ) {
    throw new Error("backfill_days must be an integer from 0 through 90");
  }
  if (
    !Number.isInteger(maxWindowDays) ||
    maxWindowDays < 1 ||
    maxWindowDays > 30
  ) {
    throw new Error("maxWindowDays must be an integer from 1 through 30");
  }
  if ((from && !through) || (!from && through)) {
    throw new Error("from and through must be supplied together");
  }
  if (parsedBackfillDays > 0 && (from || through)) {
    throw new Error(
      "Use either an explicit from/through window or backfill_days, not both",
    );
  }

  const localToday = dateInTimeZone(now, timeZone);
  let first = from || localToday;
  const last = through || localToday;
  assertIsoDate(first, "from");
  assertIsoDate(last, "through");
  if (parsedBackfillDays > 0) first = addDays(last, -(parsedBackfillDays - 1));
  if (first > last) throw new Error("from must not be after through");

  const windows = [];
  let cursor = first;
  while (cursor <= last) {
    const end = minDate(addDays(cursor, maxWindowDays - 1), last);
    windows.push({ from: cursor, through: end });
    cursor = addDays(end, 1);
  }
  return windows;
}

export function branchToken(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("A non-empty automation identifier is required");
  }
  const token = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  if (!token)
    throw new Error("Identifier cannot be represented safely in a branch name");
  return token;
}

function assertIsoDate(value, label) {
  if (!ISO_DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${label} must be an ISO date (YYYY-MM-DD)`);
  }
}

function addDays(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function minDate(left, right) {
  return left < right ? left : right;
}

function dateInTimeZone(value, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type) =>
    parts.find((candidate) => candidate.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function boundedInteger(value, label, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `${label} must be an integer from ${minimum} through ${maximum}`,
    );
  }
  return parsed;
}

function normalizedLogin(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function optionalRoot(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function copyPrivateState(sourceRoot, targetRoot) {
  const source = join(sourceRoot, "data", "private");
  const target = join(targetRoot, "data", "private");
  try {
    await cp(source, target, { recursive: true, preserveTimestamps: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function promotePrivatePaths(stagedRoot, actualRoot, changedPaths) {
  for (const changedPath of changedPaths) {
    const source = confinedPath(stagedRoot, changedPath);
    const target = confinedPath(actualRoot, changedPath);
    const bytes = await readFile(source);
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, bytes, { mode: 0o600 });
    await rename(temporary, target);
  }
}

function confinedPath(root, changedPath) {
  const normalized = validateRelativePath(changedPath);
  if (!normalized.startsWith(PRIVATE_PREFIX)) {
    throw new Error(`Staged discovery path must remain private: ${normalized}`);
  }
  const resolvedRoot = resolve(root);
  const target = resolve(resolvedRoot, normalized);
  if (!target.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error(`Staged discovery path escapes its root: ${normalized}`);
  }
  return target;
}

async function removeStagedRoot(parent, stagedRoot) {
  const nested = relative(parent, stagedRoot);
  if (!nested || nested === ".." || nested.startsWith(`..${sep}`)) {
    throw new Error("Refusing to remove a staged root outside runner temp");
  }
  await rm(stagedRoot, { recursive: true, force: true });
}
