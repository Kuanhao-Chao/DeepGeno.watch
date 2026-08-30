#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CANDIDATE_LABEL,
  PRIVATE_PREFIX,
  SUMMARY_LABEL,
  assertMergedByCurator,
  assertPrivateStateRemote,
  assertPrivateStateCheckout,
  assertPrivateRepository,
  automationWorkingDirectory,
  branchToken,
  buildLiteratureInvocation,
  executeApprovedPublication,
  executeStagedDiscovery,
  extractReviewId,
  parseJsonLine,
  privateGhArguments,
  pullRequestMetadata,
  readEvent,
  relevantPullRequestKind,
  resolveAutomationRoots,
  resolveDiscoveryWindows,
  validateChangedPaths,
  validateModelEnvironment,
  validateRelativePath,
  validateSelectedPaperLimit,
} from "./workflow-lib.mjs";

const roots = resolveAutomationRoots(process.env, process.cwd());
const runnerTemp = resolve(
  process.env.RUNNER_TEMP || tmpdir(),
  "deepgeno-watch",
);

export async function main() {
  const command = process.argv[2];
  await mkdir(runnerTemp, { recursive: true });
  if (command === "assert-private") return assertPrivate();
  if (command === "triage-check") return triageCheck();
  if (command === "ingest") return ingest();
  if (command === "record-triage") return recordTriage();
  if (command === "record-summary") return recordSummary();
  if (command === "validate-model")
    return validateModelEnvironment(process.env);
  if (command === "synthesize") return synthesize();
  if (command === "publish-approved") return publishApproved();
  throw new Error(
    "Usage: automation.mjs <assert-private|triage-check|ingest|record-triage|record-summary|validate-model|synthesize|publish-approved>",
  );
}

async function assertPrivate() {
  const event = await githubEvent();
  await assertBoundPrivateState(event);
  console.log("Private repository boundary confirmed.");
}

async function triageCheck() {
  const event = await githubEvent();
  const kind = relevantPullRequestKind(event);
  if (!kind) {
    console.log(
      "No literature review label; triage validation is not applicable.",
    );
    return;
  }
  await assertBoundPrivateState(event);
  const metadata = pullRequestMetadata(event);
  const { id } = extractReviewId(metadata.body, kind);
  const bodyFile = await writePullRequestBody(
    metadata.body,
    `validate-${kind}.md`,
  );
  const decidedAt = metadata.updatedAt || new Date().toISOString();
  if (kind === "candidate") {
    const result = literature("apply-triage", [
      "--batch",
      id,
      "--body-file",
      bodyFile,
      "--actor-id",
      "github-validation",
      "--actor-name",
      "GitHub validation",
      "--decided-at",
      decidedAt,
    ]);
    validateSelectedPaperLimit(
      requireStringArray(result.selectedPaperIds, "selectedPaperIds"),
      process.env.DEEPGENO_MAX_SUMMARIES_PER_RUN,
    );
  } else {
    literature("apply-draft", [
      "--draft",
      id,
      "--body-file",
      bodyFile,
      "--actor-id",
      "github-validation",
      "--actor-name",
      "GitHub validation",
      "--decided-at",
      decidedAt,
    ]);
  }
  console.log(`${kind} review has exactly one valid decision per item.`);
}

async function ingest() {
  const event = await githubEvent();
  await assertBoundPrivateState(event);
  const shadow = parseBoolean(process.env.INPUT_SHADOW || "false", "shadow");
  const trigger =
    process.env.GITHUB_EVENT_NAME === "schedule"
      ? "schedule"
      : process.env.INPUT_MODE || "manual";
  if (!new Set(["schedule", "manual", "replay"]).has(trigger)) {
    throw new Error("mode must be manual or replay");
  }
  const windows = resolveDiscoveryWindows({
    from: optional(process.env.INPUT_FROM),
    through: optional(process.env.INPUT_THROUGH),
    backfillDays: process.env.INPUT_BACKFILL_DAYS || 0,
    maxWindowDays: Number(process.env.INPUT_BATCH_DAYS || 30),
  });
  await executeStagedDiscovery({
    stateRoot: roots.stateRoot,
    runnerTemp,
    shadow,
    discover: async (stagedStateRoot) => {
      const reports = [];
      for (const window of windows) {
        const result = literature(
          "discover",
          ["--from", window.from, "--to", window.through, "--trigger", trigger],
          { stateRoot: stagedStateRoot },
        );
        const candidateCount = requireNonNegativeInteger(
          result.candidateCount,
          "candidateCount",
        );
        const batchRevision = requirePositiveInteger(
          result.batchRevision,
          "batchRevision",
        );
        const reviewPath = validatePrivateReviewPath(result.reviewPath);
        const changedPaths = validateChangedPaths(result.changedPaths, [
          PRIVATE_PREFIX,
        ]).filter(
          (changedPath) => candidateCount > 0 || changedPath !== reviewPath,
        );
        console.log(
          `Discovery ${window.from}…${window.through}: ${candidateCount} candidate(s)${shadow ? " (shadow)" : ""}.`,
        );
        reportSourceIssues(result.sourceIssues);
        reports.push({
          ...result,
          window,
          candidateCount,
          batchRevision,
          reviewPath,
          changedPaths,
        });
      }
      return reports;
    },
    accept: async (reports) => {
      configureGit();
      switchToMain();
      const reviewPaths = new Set(
        reports
          .filter((report) => report.candidateCount > 0)
          .map((report) => report.reviewPath),
      );
      const statePaths = [
        ...new Set(
          reports
            .flatMap((report) => report.changedPaths)
            .filter((changedPath) => !reviewPaths.has(changedPath)),
        ),
      ];
      await commitAndPush(
        statePaths,
        `chore(literature): record discovery ${windows[0]?.from} through ${windows.at(-1)?.through}`,
      );
      for (const report of reports) {
        if (report.candidateCount === 0) continue;
        await openReviewPullRequest({
          branch: `literature/candidates/${branchToken(`${report.batchId}-r${report.batchRevision}`)}`,
          label: CANDIDATE_LABEL,
          labelDescription: "Private daily literature candidate inbox",
          labelColor: "2f7d74",
          title: `Literature candidates · ${report.window.through}`,
          reviewPath: report.reviewPath,
          commitMessage: `review: triage candidate batch ${report.batchId}`,
        });
      }
    },
  });
}

async function recordTriage() {
  const event = await mergedReviewEvent("candidate");
  configureGit();
  const metadata = pullRequestMetadata(event);
  const { id: batchId } = extractReviewId(metadata.body, "candidate");
  const bodyFile = await writePullRequestBody(
    metadata.body,
    `candidate-${branchToken(batchId)}.md`,
  );
  const result = literature("apply-triage", [
    "--batch",
    batchId,
    "--body-file",
    bodyFile,
    "--actor-id",
    metadata.actorId,
    "--actor-name",
    metadata.actorName,
    "--decided-at",
    metadata.mergedAt,
  ]);
  const changedPaths = validateChangedPaths(result.changedPaths, [
    PRIVATE_PREFIX,
  ]);
  const selected = requireStringArray(
    result.selectedPaperIds,
    "selectedPaperIds",
  );
  validateSelectedPaperLimit(
    selected,
    process.env.DEEPGENO_MAX_SUMMARIES_PER_RUN,
  );
  await commitAndPush(
    changedPaths,
    `chore(literature): record triage ${result.decisionBatchId}`,
  );
  await setOutput("papers", JSON.stringify(selected));
  await setOutput("selected_count", String(selected.length));
  await setOutput("batch", batchId);
  console.log(
    `Recorded triage for ${batchId}; ${selected.length} paper(s) selected.`,
  );
}

async function synthesize() {
  const event = await githubEvent();
  await assertBoundPrivateState(event);
  validateModelEnvironment(process.env);
  const paperId = requireSafeValue(
    process.env.INPUT_PAPER_ID,
    "INPUT_PAPER_ID",
  );
  const revisionOf = optional(process.env.INPUT_REVISION_OF);
  if (revisionOf) requireSafeValue(revisionOf, "INPUT_REVISION_OF");
  configureGit();
  switchToMain();
  const result = literature("synthesize", [
    "--paper",
    paperId,
    ...(revisionOf ? ["--revision-of", revisionOf] : []),
  ]);
  const reviewPath = validatePrivateReviewPath(result.reviewPath);
  const changedPaths = validateChangedPaths(result.changedPaths, [
    PRIVATE_PREFIX,
  ]);
  const statePaths = changedPaths.filter((path) => path !== reviewPath);
  await commitAndPush(
    statePaths,
    `chore(literature): record draft ${result.draftId}`,
  );
  await openReviewPullRequest({
    branch: `literature/summaries/${branchToken(result.draftId)}`,
    label: SUMMARY_LABEL,
    labelDescription: "Private LLM summary awaiting human approval",
    labelColor: "795da3",
    title: `Summary review · ${result.slug}`,
    reviewPath,
    commitMessage: `review: inspect summary draft ${result.draftId}`,
  });
}

async function recordSummary() {
  const event = await mergedReviewEvent("summary");
  configureGit();
  const metadata = pullRequestMetadata(event);
  const { id: draftId } = extractReviewId(metadata.body, "summary");
  const bodyFile = await writePullRequestBody(
    metadata.body,
    `summary-${branchToken(draftId)}.md`,
  );
  const decisionArgs = [
    "--draft",
    draftId,
    "--body-file",
    bodyFile,
    "--actor-id",
    metadata.actorId,
    "--actor-name",
    metadata.actorName,
    "--decided-at",
    metadata.mergedAt,
    "--pull-request-url",
    metadata.url,
    "--merge-commit-sha",
    metadata.mergeCommitSha,
  ];
  const decision = literature("apply-draft", decisionArgs);
  const approved = requireStringArray(
    decision.approvedDraftIds,
    "approvedDraftIds",
  );
  const revised = requireStringArray(
    decision.revisedDraftIds,
    "revisedDraftIds",
  );
  const dismissed = requireStringArray(
    decision.dismissedDraftIds,
    "dismissedDraftIds",
  );
  const actions = [
    ...(approved.includes(draftId) ? ["approve"] : []),
    ...(revised.includes(draftId) ? ["revise"] : []),
    ...(dismissed.includes(draftId) ? ["dismiss"] : []),
  ];
  if (actions.length !== 1)
    throw new Error(`Expected one recorded action for ${draftId}`);
  const paperId = requireSafeValue(decision.paperId, "paperId");
  const changedPaths = validateChangedPaths(decision.changedPaths, [
    PRIVATE_PREFIX,
  ]);
  await commitAndPush(
    changedPaths,
    `chore(literature): record summary decision ${draftId}`,
  );
  await setOutput("action", actions[0]);
  await setOutput("draft_id", draftId);
  await setOutput("paper_id", paperId);
  console.log(`Recorded ${actions[0]} for ${draftId}.`);
}

async function publishApproved() {
  const event = await githubEvent();
  await assertBoundPrivateState(event);
  const draftId = requireSafeValue(
    process.env.INPUT_DRAFT_ID,
    "INPUT_DRAFT_ID",
  );
  configureGit();
  switchToMain();
  const { delivery } = await executeApprovedPublication({
    publish: async () => literature("publish", ["--draft", draftId]),
    commitPending: async (publication) => {
      const changedPaths = validateChangedPaths(publication.changedPaths, [
        PRIVATE_PREFIX,
      ]);
      await commitAndPush(
        [...new Set(changedPaths)],
        `feat(literature): seal approved summary ${draftId}`,
      );
    },
    verifyProject: async () => {
      run("npm", ["run", "build"], {
        cwd: automationWorkingDirectory("build", roots),
      });
      run("npm", ["run", "privacy"], {
        cwd: automationWorkingDirectory("privacy", roots),
      });
    },
    deliver: async (slug) => literature("deliver", ["--slug", slug]),
    commitReceipt: async (result) => {
      const deliveryPaths = validateChangedPaths(result.changedPaths, [
        PRIVATE_PREFIX,
      ]);
      await commitAndPush(
        deliveryPaths,
        `chore(literature): record public delivery ${result.slug}`,
      );
    },
  });
  console.log(`Public delivery ${delivery.state}: ${delivery.pullRequestUrl}`);
}

async function mergedReviewEvent(expectedKind) {
  const event = await githubEvent();
  await assertBoundPrivateState(event);
  const kind = relevantPullRequestKind(event);
  if (kind !== expectedKind) {
    throw new Error(`Expected a merged ${expectedKind} review pull request`);
  }
  const metadata = pullRequestMetadata(event);
  if (
    !metadata.merged ||
    !metadata.mergedAt ||
    !metadata.actorId ||
    !metadata.url ||
    !metadata.mergeCommitSha
  ) {
    throw new Error("Pull request is not a complete merged event");
  }
  assertMergedByCurator(event, process.env.DEEPGENO_CURATOR_GITHUB_LOGIN);
  return event;
}

async function assertBoundPrivateState(event) {
  assertPrivateRepository(event);
  const bound = await assertPrivateStateCheckout({ roots, event });
  roots.projectRoot = bound.projectRoot;
  roots.stateRoot = bound.stateRoot;
  roots.repository = bound.repository;
}

function literature(command, args, { stateRoot = roots.stateRoot } = {}) {
  const invocation = buildLiteratureInvocation(command, args, roots, stateRoot);
  const output = run(invocation.command, invocation.args, {
    cwd: invocation.cwd,
    capture: true,
  });
  return parseJsonLine(output, command);
}

function configureGit() {
  const cwd = automationWorkingDirectory("git", roots);
  run("git", ["config", "user.name", "deepgeno-watch[bot]"], { cwd });
  run(
    "git",
    [
      "config",
      "user.email",
      "41898282+github-actions[bot]@users.noreply.github.com",
    ],
    { cwd },
  );
}

function switchToMain() {
  run("git", ["switch", "main"], {
    cwd: automationWorkingDirectory("git", roots),
  });
}

async function commitAndPush(paths, message) {
  if (paths.length === 0) return false;
  const cwd = automationWorkingDirectory("git", roots);
  for (const path of paths) run("git", ["add", "--", path], { cwd });
  const staged = spawnSync("git", ["diff", "--cached", "--quiet"], {
    cwd,
  });
  if (staged.status === 0) return false;
  if (staged.status !== 1)
    throw commandError("git diff --cached --quiet", staged);
  run("git", ["commit", "-m", message], { cwd });
  await assertPrivateStateRemote({
    stateRoot: roots.stateRoot,
    repository: roots.repository,
  });
  run("git", ["push", "origin", "HEAD:main"], { cwd });
  return true;
}

async function openReviewPullRequest({
  branch,
  label,
  labelDescription,
  labelColor,
  title,
  reviewPath,
  commitMessage,
}) {
  const existing = JSON.parse(
    run(
      "gh",
      privateGh([
        "pr",
        "list",
        "--state",
        "all",
        "--head",
        branch,
        "--json",
        "number,state,url,mergedAt",
      ]),
      { cwd: automationWorkingDirectory("gh", roots), capture: true },
    ) || "[]",
  );
  if (existing.length > 0) {
    const pullRequest = existing[0];
    if (pullRequest.state === "CLOSED" && !pullRequest.mergedAt) {
      run("gh", privateGh(["pr", "reopen", String(pullRequest.number)]), {
        cwd: automationWorkingDirectory("gh", roots),
      });
      console.log(
        `Reopened ${pullRequest.url}; no duplicate review PR created.`,
      );
    } else {
      console.log(
        `Reusing ${pullRequest.url}; no duplicate review PR created.`,
      );
    }
    return pullRequest.url;
  }

  const remote = spawnSync(
    "git",
    ["ls-remote", "--exit-code", "--heads", "origin", branch],
    {
      cwd: automationWorkingDirectory("git", roots),
      encoding: "utf8",
    },
  );
  if (remote.status !== 0 && remote.status !== 2) {
    throw commandError(`git ls-remote origin ${branch}`, remote);
  }
  if (remote.status === 2) {
    switchToMain();
    const gitCwd = automationWorkingDirectory("git", roots);
    run("git", ["switch", "-c", branch], { cwd: gitCwd });
    run("git", ["add", "--", reviewPath], { cwd: gitCwd });
    run("git", ["commit", "-m", commitMessage], { cwd: gitCwd });
    await assertPrivateStateRemote({
      stateRoot: roots.stateRoot,
      repository: roots.repository,
    });
    run("git", ["push", "--set-upstream", "origin", branch], {
      cwd: gitCwd,
    });
  }

  run(
    "gh",
    privateGh([
      "label",
      "create",
      label,
      "--description",
      labelDescription,
      "--color",
      labelColor,
      "--force",
    ]),
    { cwd: automationWorkingDirectory("gh", roots) },
  );
  const url = run(
    "gh",
    privateGh([
      "pr",
      "create",
      "--base",
      "main",
      "--head",
      branch,
      "--title",
      title,
      "--body-file",
      reviewPath,
      "--label",
      label,
    ]),
    { cwd: automationWorkingDirectory("gh", roots), capture: true },
  ).trim();
  console.log(`Opened ${url}`);
  switchToMain();
  return url;
}

function privateGh(args) {
  return privateGhArguments(roots.repository, args);
}

function run(command, args, { cwd, capture = false }) {
  if (!cwd) throw new Error(`Working directory is required for ${command}`);
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.status !== 0)
    throw commandError(`${command} ${args.join(" ")}`, result);
  if (capture && result.stderr) process.stderr.write(result.stderr);
  return capture ? result.stdout : "";
}

function commandError(display, result) {
  const detail = [result.stderr, result.stdout]
    .filter(Boolean)
    .join("\n")
    .trim();
  return new Error(
    `${display} failed with exit ${String(result.status)}${detail ? `\n${detail}` : ""}`,
  );
}

async function githubEvent() {
  return readEvent(process.env.GITHUB_EVENT_PATH);
}

async function writePullRequestBody(body, name) {
  const path = resolve(runnerTemp, name);
  await writeFile(path, body, { encoding: "utf8", mode: 0o600 });
  return path;
}

async function setOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) throw new Error("GITHUB_OUTPUT is required");
  if (value.includes("\n") || value.includes("\r")) {
    throw new Error(`Refusing multiline GitHub output for ${name}`);
  }
  await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, "utf8");
}

function validatePrivateReviewPath(value) {
  const path = validateRelativePath(value);
  if (!path.startsWith(`${PRIVATE_PREFIX}reviews/`)) {
    throw new Error(`Review path must remain private: ${path}`);
  }
  return path;
}

function requireNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`${label} must be non-negative`);
  return value;
}

function requirePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`${label} must be positive`);
  return value;
}

function reportSourceIssues(value) {
  if (!Array.isArray(value)) throw new Error("sourceIssues must be an array");
  for (const issue of value) {
    if (
      !issue ||
      typeof issue.source !== "string" ||
      typeof issue.code !== "string"
    ) {
      throw new Error("sourceIssues contains an invalid entry");
    }
    console.warn(`Source warning: ${issue.source} (${issue.code}).`);
  }
}

function requireStringArray(value, label) {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !item)
  ) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
  return value;
}

function requireSafeValue(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error(`${label} contains an unsafe identifier`);
  }
  return value;
}

function parseBoolean(value, label) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${label} must be true or false`);
}

function optional(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
