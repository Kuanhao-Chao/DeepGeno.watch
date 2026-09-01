import { describe, expect, it } from "vitest";

import {
  assertGitHubDeliveryCoordinates,
  deliverPublicRelease,
  type GitHubBranch,
  type GitHubChangedFile,
  type GitHubContent,
  type GitHubDeliveryPort,
  type GitHubPullRequest,
  type GitHubRepository,
} from "./delivery.js";
import {
  createPendingDelivery,
  sealPublicProjection,
  transitionDelivery,
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
    expect(
      remote.branchBytes(`deepgeno/publish/${slug}`, projectionPath),
    ).toEqual(sealedBytes);
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

    const first = await deliverPublicRelease(
      request(fixture.release, fixture.delivery),
      remote,
    );
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
    await deliverPublicRelease(
      request(fixture.release, fixture.delivery),
      remote,
    );
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
    await deliverPublicRelease(
      request(fixture.release, fixture.delivery),
      remote,
    );
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
    await deliverPublicRelease(
      request(fixture.release, fixture.delivery),
      remote,
    );
    remote.pullRequests[0]!.body =
      "private draft-private-paper-r1 reviewer notes must not be public";

    await expect(
      deliverPublicRelease(request(fixture.release, fixture.delivery), remote),
    ).rejects.toMatchObject({ code: "delivery_pull_request_metadata_invalid" });
    expect(remote.pullRequests).toHaveLength(1);
  });

  it.each(["120000", "100755"])(
    "refuses non-regular %s target entries before PR creation",
    async (mode) => {
      const remote = new MemoryGitHubDeliveryPort();
      const fixture = releaseFixture();
      remote.seedBranch(`deepgeno/publish/${slug}`, {
        [projectionPath]: sealedBytes,
      });
      remote.seedBranchEntry(
        `deepgeno/publish/${slug}`,
        projectionPath,
        sealedBytes,
        mode,
      );

      await expect(
        deliverPublicRelease(
          request(fixture.release, fixture.delivery),
          remote,
        ),
      ).rejects.toMatchObject({ code: "delivery_content_conflict" });
      expect(remote.pullRequests).toHaveLength(0);
    },
  );

  it.each([
    { status: "renamed", previousPath: "content/public/papers/old.md" },
    { status: "removed" },
    { status: "modified" },
    { status: "copied" },
  ])("refuses existing PR file status %#", async (changed) => {
    const remote = new MemoryGitHubDeliveryPort();
    const fixture = releaseFixture();
    await deliverPublicRelease(
      request(fixture.release, fixture.delivery),
      remote,
    );
    remote.setPullRequestFiles(1, [{ path: projectionPath, ...changed }]);

    await expect(
      deliverPublicRelease(request(fixture.release, fixture.delivery), remote),
    ).rejects.toMatchObject({ code: "delivery_file_scope_invalid" });
  });

  it("rejects non-public repository metadata before any public mutation", async () => {
    const remote = new MemoryGitHubDeliveryPort();
    remote.repositoryMetadata = {
      ...remote.repositoryMetadata,
      private: true,
      visibility: "private",
    };
    const fixture = releaseFixture();

    await expect(
      deliverPublicRelease(request(fixture.release, fixture.delivery), remote),
    ).rejects.toMatchObject({ code: "delivery_repository_untrusted" });
    expect(remote.branches).toHaveLength(0);
    expect(remote.pullRequests).toHaveLength(0);
  });

  it("anchors a stored receipt to its exact PR and rejects changed remote heads without mutation", async () => {
    const remote = new MemoryGitHubDeliveryPort();
    const fixture = releaseFixture();
    const initial = await deliverPublicRelease(
      request(fixture.release, fixture.delivery),
      remote,
    );
    const receiptDelivery = transitionDelivery(
      fixture.delivery,
      "pr-open",
      "2026-08-28T07:01:00.000Z",
      { remote: initial.remote },
    );
    remote.pullRequests[0]!.headSha = "a".repeat(40);

    await expect(
      deliverPublicRelease(request(fixture.release, receiptDelivery), remote),
    ).rejects.toMatchObject({ code: "delivery_receipt_conflict" });
    expect(remote.contentWriteCount).toBe(1);
    expect(remote.pullRequests).toHaveLength(1);
  });

  it("reconciles only the same failed receipt when its PR is reopened or later merged", async () => {
    const remote = new MemoryGitHubDeliveryPort();
    const fixture = releaseFixture();
    await deliverPublicRelease(
      request(fixture.release, fixture.delivery),
      remote,
    );
    remote.closePullRequest(1);
    const failed = await deliverPublicRelease(
      request(fixture.release, fixture.delivery),
      remote,
    );
    if (failed.state !== "failed")
      throw new Error("Expected closed PR failure");
    const failedDelivery = transitionDelivery(
      fixture.delivery,
      "failed",
      "2026-08-28T07:01:00.000Z",
      { remote: failed.remote, failure: failed.failure },
    );
    remote.pullRequests[0]!.state = "open";
    const reopened = await deliverPublicRelease(
      request(fixture.release, failedDelivery),
      remote,
    );
    expect(reopened).toMatchObject({ state: "pr-open", remote: failed.remote });
    remote.mergePullRequest(1, { deleteBranch: true });
    const merged = await deliverPublicRelease(
      request(fixture.release, failedDelivery),
      remote,
    );
    expect(merged).toMatchObject({ state: "merged", remote: failed.remote });
    expect(remote.pullRequests).toHaveLength(1);
  });

  it("truncates only the Unicode-safe GitHub title while retaining the full public body title", async () => {
    const remote = new MemoryGitHubDeliveryPort();
    const fixture = releaseFixture();
    const title = `${"🧬".repeat(300)} Public genome model`;
    await deliverPublicRelease(
      {
        ...request(fixture.release, fixture.delivery),
        publicMetadata: {
          title,
          sourceUrl: "https://example.org/public-paper",
        },
      },
      remote,
    );
    const pullRequest = remote.pullRequests[0]!;
    expect(Array.from(pullRequest.title)).toHaveLength(256);
    expect(pullRequest.title.endsWith("…")).toBe(true);
    expect(pullRequest.body).toContain(title);
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
    expect(
      remote.branchBytes(`deepgeno/publish/${slug}`, projectionPath),
    ).toEqual(sealedBytes);
  });

  it("rejects a delivery branch that moves after its sealed comparison snapshot", async () => {
    const remote = new MemoryGitHubDeliveryPort();
    const fixture = releaseFixture();
    remote.moveBranchAfterPullRequestFiles(
      `deepgeno/publish/${slug}`,
      "content/public/papers/injected.md",
    );

    await expect(
      deliverPublicRelease(request(fixture.release, fixture.delivery), remote),
    ).rejects.toMatchObject({ code: "delivery_head_conflict" });
    expect(remote.pullRequests).toHaveLength(1);
  });

  it("does not append sealed bytes when the branch moves immediately before its atomic write", async () => {
    const remote = new MemoryGitHubDeliveryPort();
    const fixture = releaseFixture();
    remote.moveBranchBeforeNextContentWrite(
      `deepgeno/publish/${slug}`,
      "content/public/papers/injected.md",
    );

    await expect(
      deliverPublicRelease(request(fixture.release, fixture.delivery), remote),
    ).rejects.toThrow(/branch head changed/);
    expect(remote.contentWriteCount).toBe(0);
    expect(
      remote.branchBytes(`deepgeno/publish/${slug}`, projectionPath),
    ).toBeUndefined();
    expect(
      remote.branchBytes(
        `deepgeno/publish/${slug}`,
        "content/public/papers/injected.md",
      ),
    ).toEqual(new TextEncoder().encode("injected"));
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
    ).toThrowError(
      expect.objectContaining({ code: "delivery_branch_invalid" }),
    );
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
    ).toThrowError(
      expect.objectContaining({ code: "delivery_branch_invalid" }),
    );
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
  files: Map<string, { bytes: Uint8Array; mode: string }>;
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
  readonly #main = new Map<string, { bytes: Uint8Array; mode: string }>();
  readonly #faults: MemoryFaults;
  repositoryMetadata: GitHubRepository = {
    fullName: repository,
    private: false,
    visibility: "public" as const,
    defaultBranch: "main",
  };
  contentWriteCount = 0;
  #moveAfterPullRequestFiles: { branch: string; path: string } | undefined;
  #moveBeforeContentWrite: { branch: string; path: string } | undefined;

  constructor(faults: Partial<MemoryFaults> = {}) {
    this.#faults = {
      throwAfterCreateBranch: false,
      throwAfterPutContent: false,
      throwAfterCreatePullRequest: false,
      ...faults,
    };
  }

  async getRepository(input: { repository: string }) {
    this.assertRepository(input.repository);
    return this.repositoryMetadata;
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
        : this.branches.find(
            (branch) => branch.name === input.ref || branch.sha === input.ref,
          )?.files;
    const file = files?.get(input.path);
    return file
      ? {
          path: input.path,
          bytes: Uint8Array.from(file.bytes),
          blobSha: "c".repeat(40),
          mode: file.mode,
        }
      : undefined;
  }

  async putContent(input: {
    repository: string;
    path: string;
    branch: string;
    expectedHeadSha: string;
    bytes: Uint8Array;
    message: string;
  }): Promise<GitHubBranch> {
    this.assertRepository(input.repository);
    if (input.branch === "main") throw new Error("direct main write");
    const branch = this.branches.find((entry) => entry.name === input.branch);
    if (!branch) throw new Error("missing branch");
    if (this.#moveBeforeContentWrite?.branch === input.branch) {
      branch.files.set(this.#moveBeforeContentWrite.path, {
        bytes: new TextEncoder().encode("injected"),
        mode: "100644",
      });
      branch.sha = "c".repeat(40);
      this.#moveBeforeContentWrite = undefined;
    }
    if (branch.sha !== input.expectedHeadSha)
      throw new Error("branch head changed before atomic content write");
    branch.files.set(input.path, {
      bytes: Uint8Array.from(input.bytes),
      mode: "100644",
    });
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
    const branch = this.branches.find(
      (entry) => entry.name === input.head || entry.sha === input.head,
    );
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

  async getPullRequest(input: {
    repository: string;
    pullRequestNumber: number;
  }): Promise<GitHubPullRequest | undefined> {
    this.assertRepository(input.repository);
    return this.pullRequests.find(
      (entry) => entry.number === input.pullRequestNumber,
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
    if (this.#moveAfterPullRequestFiles?.branch === pullRequest.head) {
      const branch = this.branches.find(
        (entry) => entry.name === pullRequest.head,
      );
      if (!branch) throw new Error("missing branch");
      branch.files.set(this.#moveAfterPullRequestFiles.path, {
        bytes: new TextEncoder().encode("injected"),
        mode: "100644",
      });
      branch.sha = "d".repeat(40);
      this.#moveAfterPullRequestFiles = undefined;
    }
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
      files.set(filePath, { bytes: Uint8Array.from(bytes), mode: "100644" });
    this.branches.push({ name: branchName, sha: "b".repeat(40), files });
  }

  seedBranchEntry(
    branchName: string,
    filePath: string,
    bytes: Uint8Array,
    mode: string,
  ): void {
    const branch = this.branches.find((entry) => entry.name === branchName);
    if (!branch) throw new Error("missing branch");
    branch.files.set(filePath, { bytes: Uint8Array.from(bytes), mode });
  }

  setPullRequestFiles(
    pullRequestNumber: number,
    files: GitHubChangedFile[],
  ): void {
    const pullRequest = this.pullRequests.find(
      (entry) => entry.number === pullRequestNumber,
    );
    if (!pullRequest) throw new Error("missing pull request");
    pullRequest.files = files;
  }

  moveBranchAfterPullRequestFiles(branch: string, path: string): void {
    this.#moveAfterPullRequestFiles = { branch, path };
  }

  moveBranchBeforeNextContentWrite(branch: string, path: string): void {
    this.#moveBeforeContentWrite = { branch, path };
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
    for (const changedFile of pullRequest.files) {
      const file = branch.files.get(changedFile.path);
      if (file)
        this.#main.set(changedFile.path, {
          bytes: Uint8Array.from(file.bytes),
          mode: file.mode,
        });
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
    const file = this.branches
      .find((branch) => branch.name === branchName)
      ?.files.get(filePath);
    return file ? Uint8Array.from(file.bytes) : undefined;
  }

  mainBytes(filePath: string): Uint8Array | undefined {
    const file = this.#main.get(filePath);
    return file ? Uint8Array.from(file.bytes) : undefined;
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
  source: ReadonlyMap<string, { bytes: Uint8Array; mode: string }>,
): Map<string, { bytes: Uint8Array; mode: string }> {
  return new Map(
    [...source.entries()].map(([path, file]) => [
      path,
      { bytes: Uint8Array.from(file.bytes), mode: file.mode },
    ]),
  );
}

function differences(
  left: ReadonlyMap<string, { bytes: Uint8Array; mode: string }>,
  right: ReadonlyMap<string, { bytes: Uint8Array; mode: string }>,
): string[] {
  const paths = new Set([...left.keys(), ...right.keys()]);
  return [...paths]
    .filter((path) => !equalBytes(left.get(path), right.get(path)))
    .sort();
}

function equalBytes(
  left: { bytes: Uint8Array; mode: string } | undefined,
  right: { bytes: Uint8Array; mode: string } | undefined,
): boolean {
  if (!left || !right) return left === right;
  return Buffer.from(left.bytes).equals(Buffer.from(right.bytes));
}
