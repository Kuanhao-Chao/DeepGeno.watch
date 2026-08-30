import { describe, expect, it } from "vitest";

import {
  assertGitHubDeliveryCoordinates,
  deliverPublicRelease,
  type GitHubBranch,
  type GitHubChangedFile,
  type GitHubContent,
  type GitHubDeliveryPort,
  type GitHubPullRequest,
} from "./delivery.js";
import {
  createPendingDelivery,
  sealPublicProjection,
  type Delivery,
  type PrivateRelease,
} from "./release.js";
import { sha256 } from "./util.js";

const createdAt = "2026-08-28T07:00:00.000Z";
const repository = "example/deepgeno-watch";
const slug = "sealed-paper-a1b2c3d";
const projectionPath = `content/public/papers/${slug}.md`;
const sealedBytes = new TextEncoder().encode(
  "---\ntitle: Public sequence model\n---\n",
);

describe("public GitHub delivery", () => {
  it("creates one branch and one PR containing the exact sealed bytes and public metadata only", async () => {
    const remote = new MemoryGitHubDeliveryPort();
    const { release, delivery } = releaseFixture();

    const outcome = await deliverPublicRelease(
      request(release, delivery),
      remote,
    );

    expect(outcome).toMatchObject({
      state: "pr-open",
      remote: {
        repository,
        branch: `deepgeno/publish/${slug}`,
        pullRequestNumber: 1,
        pullRequestUrl: `https://github.com/${repository}/pull/1`,
      },
    });
    expect(remote.branches).toHaveLength(1);
    expect(remote.pullRequests).toHaveLength(1);
    expect(remote.branchBytes(`deepgeno/publish/${slug}`, projectionPath)).toEqual(
      sealedBytes,
    );
    expect(remote.comparePaths(`deepgeno/publish/${slug}`)).toEqual([
      projectionPath,
    ]);
    expect(remote.pullRequests[0]).toMatchObject({
      base: "main",
      head: `deepgeno/publish/${slug}`,
      title: "Literature update: Public sequence model",
      body:
        "Reviewed literature summary for Public sequence model.\n\n" +
        "Source: https://example.org/public-paper\n" +
        `Slug: ${slug}\n` +
        `Path: ${projectionPath}`,
    });
    const publicPullRequestText = `${remote.pullRequests[0]!.title}\n${remote.pullRequests[0]!.body}`;
    for (const privateValue of [
      release.id,
      release.draftId,
      delivery.id,
      release.projection.sha256,
      release.publicationSha256,
      "private-reviewer",
      "private/pull/42",
      "private-evidence",
      "provider-request-id",
      "inputTokens",
    ]) {
      expect(publicPullRequestText).not.toContain(privateValue);
    }
  });

  it("reuses matching branch bytes and the one existing open PR", async () => {
    const remote = new MemoryGitHubDeliveryPort();
    const fixture = releaseFixture();

    const first = await deliverPublicRelease(request(fixture.release, fixture.delivery), remote);
    const second = await deliverPublicRelease(
      request(fixture.release, fixture.delivery),
      remote,
    );

    expect(first).toEqual(second);
    expect(remote.branches).toHaveLength(1);
    expect(remote.pullRequests).toHaveLength(1);
    expect(remote.contentWriteCount).toBe(1);
  });

  it("refuses a differing branch file without overwriting remote bytes", async () => {
    const remote = new MemoryGitHubDeliveryPort();
    const fixture = releaseFixture();
    remote.seedBranch(`deepgeno/publish/${slug}`, {
      [projectionPath]: new TextEncoder().encode("different approved bytes"),
    });

    await expect(
      deliverPublicRelease(request(fixture.release, fixture.delivery), remote),
    ).rejects.toMatchObject({ code: "delivery_content_conflict" });

    expect(
      new TextDecoder().decode(
        remote.branchBytes(`deepgeno/publish/${slug}`, projectionPath),
      ),
    ).toBe("different approved bytes");
    expect(remote.contentWriteCount).toBe(0);
    expect(remote.pullRequests).toHaveLength(0);
  });

  it("refuses a branch or PR that changes any extra public file", async () => {
    const remote = new MemoryGitHubDeliveryPort();
    const fixture = releaseFixture();
    remote.seedBranch(`deepgeno/publish/${slug}`, {
      [projectionPath]: sealedBytes,
      "content/public/papers/unrelated.md": new TextEncoder().encode("extra"),
    });

    await expect(
      deliverPublicRelease(request(fixture.release, fixture.delivery), remote),
    ).rejects.toMatchObject({ code: "delivery_file_scope_invalid" });
    expect(remote.pullRequests).toHaveLength(0);
  });

  it("checks an existing branch scope before adding the sealed paper", async () => {
    const remote = new MemoryGitHubDeliveryPort();
    const fixture = releaseFixture();
    remote.seedBranch(`deepgeno/publish/${slug}`, {
      "content/public/papers/unrelated.md": new TextEncoder().encode("extra"),
    });

    await expect(
      deliverPublicRelease(request(fixture.release, fixture.delivery), remote),
    ).rejects.toMatchObject({ code: "delivery_file_scope_invalid" });
    expect(remote.contentWriteCount).toBe(0);
    expect(
      remote.branchBytes(`deepgeno/publish/${slug}`, projectionPath),
    ).toBeUndefined();
  });

  it("reconciles an existing merged PR after its branch was deleted", async () => {
    const remote = new MemoryGitHubDeliveryPort();
    const fixture = releaseFixture();
    await deliverPublicRelease(request(fixture.release, fixture.delivery), remote);
    remote.mergePullRequest(1, { deleteBranch: true });

    const outcome = await deliverPublicRelease(
      request(fixture.release, fixture.delivery),
      remote,
    );

    expect(outcome.state).toBe("merged");
    expect(outcome.remote.pullRequestNumber).toBe(1);
    expect(remote.branches).toHaveLength(0);
    expect(remote.mainBytes(projectionPath)).toEqual(sealedBytes);
    expect(remote.pullRequests).toHaveLength(1);
  });

  it("maps a closed-unmerged PR to failed without reopening or duplicating it", async () => {
    const remote = new MemoryGitHubDeliveryPort();
    const fixture = releaseFixture();
    await deliverPublicRelease(request(fixture.release, fixture.delivery), remote);
    remote.closePullRequest(1);

    const outcome = await deliverPublicRelease(
      request(fixture.release, fixture.delivery),
      remote,
    );

    expect(outcome).toMatchObject({
      state: "failed",
      failure: {
        code: "pull-request-closed",
        message: "The public delivery pull request was closed without merging.",
      },
    });
    expect(remote.pullRequests).toHaveLength(1);
    expect(remote.pullRequests[0]!.state).toBe("closed");
  });

  it("rejects an existing deterministic-head PR with non-allowlisted text", async () => {
    const remote = new MemoryGitHubDeliveryPort();
    const fixture = releaseFixture();
    await deliverPublicRelease(request(fixture.release, fixture.delivery), remote);
    remote.pullRequests[0]!.body =
      "private draft-private-paper-r1 reviewer notes must not be public";

    await expect(
      deliverPublicRelease(request(fixture.release, fixture.delivery), remote),
    ).rejects.toMatchObject({ code: "delivery_pull_request_metadata_invalid" });
    expect(remote.pullRequests).toHaveLength(1);
  });

  it("reconciles timeouts after branch, content, and PR creation without duplicates", async () => {
    const remote = new MemoryGitHubDeliveryPort({
      throwAfterCreateBranch: true,
      throwAfterPutContent: true,
      throwAfterCreatePullRequest: true,
    });
    const fixture = releaseFixture();

    const outcome = await deliverPublicRelease(
      request(fixture.release, fixture.delivery),
      remote,
    );

    expect(outcome.state).toBe("pr-open");
    expect(remote.branches).toHaveLength(1);
    expect(remote.pullRequests).toHaveLength(1);
    expect(remote.contentWriteCount).toBe(1);
    expect(remote.branchBytes(`deepgeno/publish/${slug}`, projectionPath)).toEqual(
      sealedBytes,
    );
  });

  it("rejects direct-main, traversal, mismatched path, branch, and repository coordinates before I/O", () => {
    const valid = {
      repository,
      base: "main",
      branch: `deepgeno/publish/${slug}`,
      slug,
      path: projectionPath,
    } as const;

    expect(() => assertGitHubDeliveryCoordinates(valid)).not.toThrow();
    expect(() =>
      assertGitHubDeliveryCoordinates({ ...valid, branch: "main" }),
    ).toThrowError(expect.objectContaining({ code: "delivery_branch_invalid" }));
    expect(() =>
      assertGitHubDeliveryCoordinates({
        ...valid,
        path: "content/public/papers/../secret.md",
      }),
    ).toThrowError(expect.objectContaining({ code: "delivery_path_invalid" }));
    expect(() =>
      assertGitHubDeliveryCoordinates({
        ...valid,
        path: "content/public/papers/another-paper.md",
      }),
    ).toThrowError(expect.objectContaining({ code: "delivery_path_invalid" }));
    expect(() =>
      assertGitHubDeliveryCoordinates({
        ...valid,
        branch: "deepgeno/publish/another-paper",
      }),
    ).toThrowError(expect.objectContaining({ code: "delivery_branch_invalid" }));
    expect(() =>
      assertGitHubDeliveryCoordinates({ ...valid, repository: "../private" }),
    ).toThrowError(
      expect.objectContaining({ code: "delivery_repository_invalid" }),
    );
  });
});

function releaseFixture(): { release: PrivateRelease; delivery: Delivery } {
  const projection = {
    version: "1.0" as const,
    slug,
    path: projectionPath,
    bytes: sealedBytes,
    sha256: sha256(sealedBytes),
  };
  const release = sealPublicProjection(projection, {
    draftId: "draft-private-paper-r1",
    publicationPath: `data/private/publications/${slug}.json`,
    publicationSha256: "a".repeat(64),
    createdAt,
  });
  return { release, delivery: createPendingDelivery(release, createdAt) };
}

function request(release: PrivateRelease, delivery: Delivery) {
  return {
    repository,
    release,
    delivery,
    publicMetadata: {
      title: "Public sequence model",
      sourceUrl: "https://example.org/public-paper",
    },
  } as const;
}

type StoredBranch = {
  name: string;
  sha: string;
  files: Map<string, Uint8Array>;
};
type StoredPullRequest = {
  number: number;
  url: string;
  state: "open" | "closed";
  merged: boolean;
  base: "main";
  head: string;
  headSha: string;
  title: string;
  body: string;
  files: GitHubChangedFile[];
};

interface MemoryFaults {
  throwAfterCreateBranch: boolean;
  throwAfterPutContent: boolean;
  throwAfterCreatePullRequest: boolean;
}

class MemoryGitHubDeliveryPort implements GitHubDeliveryPort {
  readonly branches: StoredBranch[] = [];
  readonly pullRequests: StoredPullRequest[] = [];
  readonly #main = new Map<string, Uint8Array>();
  readonly #faults: MemoryFaults;
  contentWriteCount = 0;

  constructor(
    faults: Partial<MemoryFaults> = {},
  ) {
    this.#faults = {
      throwAfterCreateBranch: false,
      throwAfterPutContent: false,
      throwAfterCreatePullRequest: false,
      ...faults,
    };
  }

  async getBranch(input: {
    repository: string;
    branch: string;
  }): Promise<GitHubBranch | undefined> {
    this.assertRepository(input.repository);
    return this.branches.find((branch) => branch.name === input.branch);
  }

  async getBaseBranch(input: {
    repository: string;
    base: "main";
  }): Promise<GitHubBranch> {
    this.assertRepository(input.repository);
    return { name: input.base, sha: "a".repeat(40) };
  }

  async createBranch(input: {
    repository: string;
    branch: string;
    fromSha: string;
  }): Promise<GitHubBranch> {
    this.assertRepository(input.repository);
    if (this.branches.some((branch) => branch.name === input.branch))
      throw new Error("branch already exists");
    const branch: StoredBranch = {
      name: input.branch,
      sha: input.fromSha,
      files: cloneFiles(this.#main),
    };
    this.branches.push(branch);
    if (this.#faults.throwAfterCreateBranch)
      throw new Error("timeout after branch creation");
    return branch;
  }

  async getContent(input: {
    repository: string;
    path: string;
    ref: string;
  }): Promise<GitHubContent | undefined> {
    this.assertRepository(input.repository);
    const files =
      input.ref === "main"
        ? this.#main
        : this.branches.find((branch) => branch.name === input.ref)?.files;
    const bytes = files?.get(input.path);
    return bytes
      ? { path: input.path, bytes: Uint8Array.from(bytes), blobSha: "c".repeat(40) }
      : undefined;
  }

  async putContent(input: {
    repository: string;
    path: string;
    branch: string;
    bytes: Uint8Array;
    message: string;
  }): Promise<GitHubBranch> {
    this.assertRepository(input.repository);
    if (input.branch === "main") throw new Error("direct main write");
    const branch = this.branches.find((entry) => entry.name === input.branch);
    if (!branch) throw new Error("missing branch");
    branch.files.set(input.path, Uint8Array.from(input.bytes));
    branch.sha = "b".repeat(40);
    this.contentWriteCount += 1;
    if (this.#faults.throwAfterPutContent)
      throw new Error("timeout after content write");
    return { name: branch.name, sha: branch.sha };
  }

  async compare(input: {
    repository: string;
    base: "main";
    head: string;
  }): Promise<readonly GitHubChangedFile[]> {
    this.assertRepository(input.repository);
    const branch = this.branches.find((entry) => entry.name === input.head);
    if (!branch) throw new Error("missing branch");
    return differences(this.#main, branch.files).map((path) => ({
      path,
      status: "added",
    }));
  }

  async listPullRequests(input: {
    repository: string;
    base: "main";
    head: string;
    state: "all";
  }): Promise<readonly GitHubPullRequest[]> {
    this.assertRepository(input.repository);
    return this.pullRequests.filter(
      (pullRequest) =>
        pullRequest.base === input.base && pullRequest.head === input.head,
    );
  }

  async listPullRequestFiles(input: {
    repository: string;
    pullRequestNumber: number;
  }): Promise<readonly GitHubChangedFile[]> {
    this.assertRepository(input.repository);
    const pullRequest = this.pullRequests.find(
      (entry) => entry.number === input.pullRequestNumber,
    );
    if (!pullRequest) throw new Error("missing pull request");
    return pullRequest.files;
  }

  async createPullRequest(input: {
    repository: string;
    base: "main";
    head: string;
    title: string;
    body: string;
  }): Promise<GitHubPullRequest> {
    this.assertRepository(input.repository);
    const branch = this.branches.find((entry) => entry.name === input.head);
    if (!branch) throw new Error("missing branch");
    const pullRequest: StoredPullRequest = {
      number: this.pullRequests.length + 1,
      url: `https://github.com/${repository}/pull/${this.pullRequests.length + 1}`,
      state: "open",
      merged: false,
      base: input.base,
      head: input.head,
      headSha: branch.sha,
      title: input.title,
      body: input.body,
      files: differences(this.#main, branch.files).map((path) => ({
        path,
        status: "added",
      })),
    };
    this.pullRequests.push(pullRequest);
    if (this.#faults.throwAfterCreatePullRequest)
      throw new Error("timeout after pull request creation");
    return pullRequest;
  }

  seedBranch(branchName: string, values: Record<string, Uint8Array>): void {
    const files = cloneFiles(this.#main);
    for (const [filePath, bytes] of Object.entries(values))
      files.set(filePath, Uint8Array.from(bytes));
    this.branches.push({ name: branchName, sha: "b".repeat(40), files });
  }

  mergePullRequest(
    pullRequestNumber: number,
    options: { deleteBranch: boolean },
  ): void {
    const pullRequest = this.pullRequests.find(
      (entry) => entry.number === pullRequestNumber,
    );
    if (!pullRequest) throw new Error("missing pull request");
    const branch = this.branches.find(
      (entry) => entry.name === pullRequest.head,
    );
    if (!branch) throw new Error("missing branch");
    for (const file of pullRequest.files) {
      const bytes = branch.files.get(file.path);
      if (bytes) this.#main.set(file.path, Uint8Array.from(bytes));
    }
    pullRequest.state = "closed";
    pullRequest.merged = true;
    if (options.deleteBranch) {
      const index = this.branches.indexOf(branch);
      this.branches.splice(index, 1);
    }
  }

  closePullRequest(pullRequestNumber: number): void {
    const pullRequest = this.pullRequests.find(
      (entry) => entry.number === pullRequestNumber,
    );
    if (!pullRequest) throw new Error("missing pull request");
    pullRequest.state = "closed";
    pullRequest.merged = false;
  }

  branchBytes(branchName: string, filePath: string): Uint8Array | undefined {
    const bytes = this.branches
      .find((branch) => branch.name === branchName)
      ?.files.get(filePath);
    return bytes ? Uint8Array.from(bytes) : undefined;
  }

  mainBytes(filePath: string): Uint8Array | undefined {
    const bytes = this.#main.get(filePath);
    return bytes ? Uint8Array.from(bytes) : undefined;
  }

  comparePaths(branchName: string): string[] {
    const branch = this.branches.find((entry) => entry.name === branchName);
    if (!branch) return [];
    return differences(this.#main, branch.files);
  }

  private assertRepository(value: string): void {
    if (value !== repository) throw new Error(`unexpected repository ${value}`);
  }
}

function cloneFiles(
  source: ReadonlyMap<string, Uint8Array>,
): Map<string, Uint8Array> {
  return new Map(
    [...source.entries()].map(([path, bytes]) => [path, Uint8Array.from(bytes)]),
  );
}

function differences(
  left: ReadonlyMap<string, Uint8Array>,
  right: ReadonlyMap<string, Uint8Array>,
): string[] {
  const paths = new Set([...left.keys(), ...right.keys()]);
  return [...paths]
    .filter((path) => !equalBytes(left.get(path), right.get(path)))
    .sort();
}

function equalBytes(
  left: Uint8Array | undefined,
  right: Uint8Array | undefined,
): boolean {
  if (!left || !right) return left === right;
  return Buffer.from(left).equals(Buffer.from(right));
}
