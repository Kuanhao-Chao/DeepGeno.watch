import { posix } from "node:path";

import { invariant } from "./errors.js";
import {
  projectionFromRelease,
  validateDeliveryReleaseLink,
  type Delivery,
  type DeliveryFailure,
  type DeliveryRemoteReceipt,
  type PrivateRelease,
} from "./release.js";
import { compactText, sha256 } from "./util.js";
import { GitFileStateStore } from "./store.js";

export type GitHubBranch = Readonly<{
  name: string;
  sha: string;
}>;

export type GitHubContent = Readonly<{
  path: string;
  bytes: Uint8Array;
  blobSha: string;
}>;

export type GitHubChangedFile = Readonly<{
  path: string;
  status: string;
}>;

export type GitHubPullRequest = Readonly<{
  number: number;
  url: string;
  title: string;
  body: string;
  state: "open" | "closed";
  merged: boolean;
  base: "main";
  head: string;
  headSha: string;
}>;

/**
 * The GitHub seam used by the delivery coordinator. Tests provide an in-memory
 * adapter; production provides the REST adapter. Network representation details
 * such as base64 content never cross this interface.
 */
export interface GitHubDeliveryPort {
  getBranch(input: {
    repository: string;
    branch: string;
  }): Promise<GitHubBranch | undefined>;
  getBaseBranch(input: {
    repository: string;
    base: "main";
  }): Promise<GitHubBranch>;
  createBranch(input: {
    repository: string;
    branch: string;
    fromSha: string;
  }): Promise<GitHubBranch>;
  getContent(input: {
    repository: string;
    path: string;
    ref: string;
  }): Promise<GitHubContent | undefined>;
  putContent(input: {
    repository: string;
    path: string;
    branch: string;
    bytes: Uint8Array;
    message: string;
  }): Promise<GitHubBranch>;
  compare(input: {
    repository: string;
    base: "main";
    head: string;
  }): Promise<readonly GitHubChangedFile[]>;
  listPullRequests(input: {
    repository: string;
    base: "main";
    head: string;
    state: "all";
  }): Promise<readonly GitHubPullRequest[]>;
  listPullRequestFiles(input: {
    repository: string;
    pullRequestNumber: number;
  }): Promise<readonly GitHubChangedFile[]>;
  createPullRequest(input: {
    repository: string;
    base: "main";
    head: string;
    title: string;
    body: string;
  }): Promise<GitHubPullRequest>;
}

export type DeliveryOutcome =
  | Readonly<{
      state: "pr-open" | "merged";
      remote: DeliveryRemoteReceipt;
    }>
  | Readonly<{
      state: "failed";
      remote: DeliveryRemoteReceipt;
      failure: DeliveryFailure;
    }>;

export type PublicDeliveryRequest = Readonly<{
  repository: string;
  release: PrivateRelease;
  delivery: Delivery;
  publicMetadata: Readonly<{
    title: string;
    sourceUrl: string;
  }>;
}>;

export type GitHubDeliveryCoordinates = Readonly<{
  repository: string;
  base: "main" | string;
  branch: string;
  slug: string;
  path: string;
}>;

export function assertGitHubDeliveryCoordinates(
  coordinates: GitHubDeliveryCoordinates,
): void {
  assertGitHubRepository(coordinates.repository);
  invariant(
    coordinates.base === "main",
    "delivery_base_invalid",
    "Public delivery base must be main",
  );
  invariant(
    /^[a-z0-9][a-z0-9-]*$/.test(coordinates.slug),
    "delivery_slug_invalid",
    "Public delivery slug is invalid",
  );
  const expectedBranch = `deepgeno/publish/${coordinates.slug}`;
  invariant(
    coordinates.branch !== "main" && coordinates.branch === expectedBranch,
    "delivery_branch_invalid",
    "Public delivery branch must be the deterministic publication branch",
  );
  const normalizedPath = posix.normalize(coordinates.path.replaceAll("\\", "/"));
  invariant(
    coordinates.path === normalizedPath &&
      coordinates.path ===
        `content/public/papers/${coordinates.slug}.md` &&
      !coordinates.path.includes("\0"),
    "delivery_path_invalid",
    "Public delivery path must match the sealed publication slug",
  );
}

export function assertGitHubRepository(repository: string): void {
  invariant(
    /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(
      repository,
    ) &&
      !repository.endsWith("/.") &&
      !repository.endsWith("/.."),
    "delivery_repository_invalid",
    "Public delivery repository must be an explicit owner/name pair",
  );
}

export type StoredDeliveryReport = Readonly<{
  command: "deliver";
  slug: string;
  state: "pr-open" | "merged" | "failed";
  pullRequestUrl: string;
  deliveryPath: string;
  changedPaths: string[];
}>;

export async function deliverStoredPublication(options: {
  store: GitFileStateStore;
  slug: string;
  repository: string;
  port: GitHubDeliveryPort;
  clock?: () => Date;
}): Promise<StoredDeliveryReport> {
  assertGitHubRepository(options.repository);
  const publication = await options.store.loadPublication(options.slug);
  invariant(
    publication,
    "publication_missing",
    `Private publication is missing: ${options.slug}`,
  );
  const release = await options.store.loadReleaseForPublication(
    options.slug,
    publication,
  );
  invariant(
    release,
    "release_missing",
    `Sealed public release is missing: ${options.slug}`,
  );
  const delivery = await options.store.loadDeliveryForRelease(release);
  invariant(
    delivery,
    "delivery_missing",
    `Private delivery is missing for release: ${release.id}`,
  );
  const outcome = await deliverPublicRelease(
    {
      repository: options.repository,
      release,
      delivery,
      publicMetadata: {
        title: publication.paper.title,
        sourceUrl: publication.paper.landingUrl,
      },
    },
    options.port,
  );
  const transition = await options.store.transitionDelivery(
    release,
    delivery.state,
    outcome.state,
    (options.clock ?? (() => new Date()))().toISOString(),
    {
      remote: outcome.remote,
      ...(outcome.state === "failed" ? { failure: outcome.failure } : {}),
    },
  );
  const deliveryPath = options.store.relative(transition.path);
  return {
    command: "deliver",
    slug: options.slug,
    state: outcome.state,
    pullRequestUrl: outcome.remote.pullRequestUrl,
    deliveryPath,
    changedPaths: transition.changed ? [deliveryPath] : [],
  };
}

/**
 * Reconciles a sealed release into one deterministic public pull request.
 * Every mutation is followed by inspection so an ambiguous network failure can
 * be retried without creating a second branch, file, or pull request.
 */
export async function deliverPublicRelease(
  request: PublicDeliveryRequest,
  port: GitHubDeliveryPort,
): Promise<DeliveryOutcome> {
  validateDeliveryReleaseLink(request.delivery, request.release);
  const projection = projectionFromRelease(request.release);
  const base = "main" as const;
  const branch = `deepgeno/publish/${projection.slug}`;
  const coordinates = {
    repository: request.repository,
    base,
    branch,
    slug: projection.slug,
    path: projection.path,
  } as const;
  assertGitHubDeliveryCoordinates(coordinates);
  const publicMetadata = validatePublicMetadata(request.publicMetadata);
  const pullRequestText = publicPullRequestText(coordinates, publicMetadata);

  let pullRequests = await port.listPullRequests({
    repository: coordinates.repository,
    base,
    head: branch,
    state: "all",
  });
  assertAtMostOnePullRequest(pullRequests);
  if (pullRequests[0]) {
    return reconcilePullRequest(
      coordinates,
      projection.bytes,
      projection.sha256,
      pullRequests[0],
      pullRequestText,
      port,
    );
  }

  let remoteBranch = await port.getBranch({
    repository: coordinates.repository,
    branch,
  });
  if (!remoteBranch) {
    const main = await port.getBaseBranch({
      repository: coordinates.repository,
      base,
    });
    assertBranch(main, "main");
    try {
      remoteBranch = await port.createBranch({
        repository: coordinates.repository,
        branch,
        fromSha: main.sha,
      });
    } catch (error) {
      remoteBranch = await port.getBranch({
        repository: coordinates.repository,
        branch,
      });
      if (!remoteBranch) throw error;
    }
  }
  assertBranch(remoteBranch, branch);

  // A pre-existing delivery branch can be a retry, but it must already be
  // confined to this release before a write is allowed. Otherwise an attacker
  // (or a stale branch) could cause us to append the sealed file to an
  // out-of-scope public change and only discover that after mutation.
  await assertExistingBranchScope(coordinates, port);

  const existingContent = await port.getContent({
    repository: coordinates.repository,
    path: coordinates.path,
    ref: branch,
  });
  if (existingContent) {
    assertMatchingContent(
      existingContent,
      coordinates.path,
      projection.bytes,
      projection.sha256,
    );
  } else {
    try {
      remoteBranch = await port.putContent({
        repository: coordinates.repository,
        path: coordinates.path,
        branch,
        bytes: projection.bytes,
        message: `Add literature summary: ${projection.slug}`,
      });
    } catch (error) {
      const reconciled = await port.getContent({
        repository: coordinates.repository,
        path: coordinates.path,
        ref: branch,
      });
      if (!reconciled) throw error;
      assertMatchingContent(
        reconciled,
        coordinates.path,
        projection.bytes,
        projection.sha256,
      );
      remoteBranch =
        (await port.getBranch({
          repository: coordinates.repository,
          branch,
        })) ?? remoteBranch;
    }
  }
  assertBranch(remoteBranch, branch);
  await assertOneBranchFile(coordinates, port);
  const finalContent = await port.getContent({
    repository: coordinates.repository,
    path: coordinates.path,
    ref: branch,
  });
  assertMatchingContent(
    finalContent,
    coordinates.path,
    projection.bytes,
    projection.sha256,
  );

  let pullRequest: GitHubPullRequest;
  try {
    pullRequest = await port.createPullRequest({
      repository: coordinates.repository,
      base,
      head: branch,
      title: pullRequestText.title,
      body: pullRequestText.body,
    });
  } catch (error) {
    pullRequests = await port.listPullRequests({
      repository: coordinates.repository,
      base,
      head: branch,
      state: "all",
    });
    assertAtMostOnePullRequest(pullRequests);
    if (!pullRequests[0]) throw error;
    pullRequest = pullRequests[0];
  }
  return reconcilePullRequest(
    coordinates,
    projection.bytes,
    projection.sha256,
    pullRequest,
    pullRequestText,
    port,
  );
}

async function reconcilePullRequest(
  coordinates: GitHubDeliveryCoordinates & { base: "main" },
  sealedBytes: Uint8Array,
  sealedSha256: string,
  pullRequest: GitHubPullRequest,
  expectedText: { title: string; body: string },
  port: GitHubDeliveryPort,
): Promise<DeliveryOutcome> {
  assertPullRequest(pullRequest, coordinates, expectedText);
  const files = await port.listPullRequestFiles({
    repository: coordinates.repository,
    pullRequestNumber: pullRequest.number,
  });
  assertOneChangedFile(files, coordinates.path);
  const remote = receipt(coordinates.repository, coordinates.branch, pullRequest);

  if (pullRequest.merged) {
    const publicContent = await port.getContent({
      repository: coordinates.repository,
      path: coordinates.path,
      ref: "main",
    });
    assertMatchingContent(
      publicContent,
      coordinates.path,
      sealedBytes,
      sealedSha256,
    );
    return { state: "merged", remote };
  }
  if (pullRequest.state === "closed") {
    return {
      state: "failed",
      remote,
      failure: {
        code: "pull-request-closed",
        message: "The public delivery pull request was closed without merging.",
      },
    };
  }

  const branch = await port.getBranch({
    repository: coordinates.repository,
    branch: coordinates.branch,
  });
  assertBranch(branch, coordinates.branch);
  invariant(
    branch.sha === pullRequest.headSha,
    "delivery_head_conflict",
    "Public delivery pull request does not target the current publication branch head",
  );
  await assertOneBranchFile(coordinates, port);
  const branchContent = await port.getContent({
    repository: coordinates.repository,
    path: coordinates.path,
    ref: coordinates.branch,
  });
  assertMatchingContent(
    branchContent,
    coordinates.path,
    sealedBytes,
    sealedSha256,
  );
  return { state: "pr-open", remote };
}

async function assertOneBranchFile(
  coordinates: GitHubDeliveryCoordinates & { base: "main" },
  port: GitHubDeliveryPort,
): Promise<void> {
  const files = await port.compare({
    repository: coordinates.repository,
    base: coordinates.base,
    head: coordinates.branch,
  });
  assertOneChangedFile(files, coordinates.path);
}

function assertOneChangedFile(
  files: readonly GitHubChangedFile[],
  expectedPath: string,
): void {
  invariant(
    files.length === 1 && files[0]?.path === expectedPath,
    "delivery_file_scope_invalid",
    `Public delivery must change exactly one sealed paper path: ${expectedPath}`,
  );
}

function assertAtMostOnePullRequest(
  pullRequests: readonly GitHubPullRequest[],
): void {
  invariant(
    pullRequests.length <= 1,
    "delivery_pull_request_conflict",
    "Multiple public delivery pull requests exist for one sealed release",
  );
}

function assertPullRequest(
  pullRequest: GitHubPullRequest,
  coordinates: GitHubDeliveryCoordinates & { base: "main" },
  expectedText: { title: string; body: string },
): void {
  invariant(
    Number.isInteger(pullRequest.number) &&
      pullRequest.number > 0 &&
      pullRequest.base === "main" &&
      pullRequest.head === coordinates.branch &&
      /^https:\/\//.test(pullRequest.url) &&
      isCommitSha(pullRequest.headSha) &&
      pullRequest.title === expectedText.title &&
      pullRequest.body === expectedText.body &&
      (pullRequest.state === "open" || pullRequest.state === "closed") &&
      (!pullRequest.merged || pullRequest.state === "closed"),
    "delivery_pull_request_metadata_invalid",
    "Public delivery pull request metadata is invalid",
  );
}

function assertBranch(
  branch: GitHubBranch | undefined,
  expectedName: string,
): asserts branch is GitHubBranch {
  invariant(
    branch?.name === expectedName && isCommitSha(branch.sha),
    "delivery_branch_invalid",
    `Public delivery branch is invalid: ${expectedName}`,
  );
}

function isCommitSha(value: string): boolean {
  return /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value);
}

function assertMatchingContent(
  content: GitHubContent | undefined,
  expectedPath: string,
  expectedBytes: Uint8Array,
  expectedSha256: string,
): asserts content is GitHubContent {
  invariant(
    content?.path === expectedPath &&
      sha256(content.bytes) === expectedSha256 &&
      Buffer.from(content.bytes).equals(Buffer.from(expectedBytes)),
    "delivery_content_conflict",
    `Public delivery branch contains different bytes at ${expectedPath}`,
  );
}

async function assertExistingBranchScope(
  coordinates: GitHubDeliveryCoordinates & { base: "main" },
  port: GitHubDeliveryPort,
): Promise<void> {
  const files = await port.compare({
    repository: coordinates.repository,
    base: coordinates.base,
    head: coordinates.branch,
  });
  if (files.length > 0) assertOneChangedFile(files, coordinates.path);
}

function receipt(
  repository: string,
  branch: string,
  pullRequest: GitHubPullRequest,
): DeliveryRemoteReceipt {
  return Object.freeze({
    repository,
    branch,
    headSha: pullRequest.headSha,
    pullRequestNumber: pullRequest.number,
    pullRequestUrl: pullRequest.url,
  });
}

function validatePublicMetadata(metadata: {
  title: string;
  sourceUrl: string;
}): { title: string; sourceUrl: string } {
  const title = compactText(metadata.title);
  invariant(
    title.length > 0 && title.length <= 200,
    "delivery_public_metadata_invalid",
    "Public delivery title is invalid",
  );
  let sourceUrl: URL;
  try {
    sourceUrl = new URL(metadata.sourceUrl);
  } catch {
    invariant(
      false,
      "delivery_public_metadata_invalid",
      "Public delivery source URL is invalid",
    );
  }
  invariant(
    sourceUrl.protocol === "https:" || sourceUrl.protocol === "http:",
    "delivery_public_metadata_invalid",
    "Public delivery source URL must use HTTP or HTTPS",
  );
  return { title, sourceUrl: sourceUrl.href };
}

function publicPullRequestText(
  coordinates: GitHubDeliveryCoordinates,
  metadata: { title: string; sourceUrl: string },
): { title: string; body: string } {
  return {
    title: `Literature update: ${metadata.title}`,
    body:
      `Reviewed literature summary for ${metadata.title}.\n\n` +
      `Source: ${metadata.sourceUrl}\n` +
      `Slug: ${coordinates.slug}\n` +
      `Path: ${coordinates.path}`,
  };
}
