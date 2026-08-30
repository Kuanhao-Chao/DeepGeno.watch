import { invariant } from "./errors.js";
import {
  assertGitHubDeliveryCoordinates,
  type GitHubBranch,
  type GitHubChangedFile,
  type GitHubContent,
  type GitHubDeliveryPort,
  type GitHubPullRequest,
} from "./delivery.js";

const GITHUB_API_VERSION = "2026-03-10";

type Fetch = typeof globalThis.fetch;

export class GitHubRestDeliveryAdapter implements GitHubDeliveryPort {
  readonly #token: string;
  readonly #fetch: Fetch;
  readonly #apiBaseUrl: string;
  #contentsWrites: Promise<void> = Promise.resolve();

  constructor(options: {
    token: string;
    fetch?: Fetch;
    apiBaseUrl?: string;
  }) {
    invariant(
      options.token.trim().length > 0,
      "github_token_required",
      "A public-repository GitHub installation token is required",
    );
    this.#token = options.token;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#apiBaseUrl = (options.apiBaseUrl ?? "https://api.github.com").replace(
      /\/+$/,
      "",
    );
  }

  async getBranch(input: {
    repository: string;
    branch: string;
  }): Promise<GitHubBranch | undefined> {
    assertPublicationBranch(input.repository, input.branch);
    return this.#readBranch(input.repository, input.branch, true);
  }

  async getBaseBranch(input: {
    repository: string;
    base: "main";
  }): Promise<GitHubBranch> {
    assertRepository(input.repository);
    invariant(
      input.base === "main",
      "delivery_base_invalid",
      "Public delivery base must be main",
    );
    const branch = await this.#readBranch(input.repository, input.base, false);
    invariant(
      branch,
      "github_response_invalid",
      "GitHub did not return the public main branch",
    );
    return branch;
  }

  async createBranch(input: {
    repository: string;
    branch: string;
    fromSha: string;
  }): Promise<GitHubBranch> {
    assertPublicationBranch(input.repository, input.branch);
    assertCommitSha(input.fromSha);
    const value = await this.#requestJson(
      input.repository,
      "POST",
      "/git/refs",
      {
        body: { ref: `refs/heads/${input.branch}`, sha: input.fromSha },
      },
    );
    return parseBranch(value, input.branch);
  }

  async getContent(input: {
    repository: string;
    path: string;
    ref: string;
  }): Promise<GitHubContent | undefined> {
    assertContentCoordinates(input.repository, input.path, input.ref, true);
    const query = new URLSearchParams({ ref: input.ref });
    const value = await this.#requestJson(
      input.repository,
      "GET",
      `/contents/${encodePath(input.path)}?${query.toString()}`,
      { allowNotFound: true },
    );
    if (value === undefined) return undefined;
    return parseContent(value, input.path);
  }

  async putContent(input: {
    repository: string;
    path: string;
    branch: string;
    bytes: Uint8Array;
    message: string;
  }): Promise<GitHubBranch> {
    assertContentCoordinates(input.repository, input.path, input.branch, false);
    invariant(
      input.message.trim().length > 0,
      "delivery_commit_message_invalid",
      "Public delivery commit message is required",
    );
    const stableInput = { ...input, bytes: Uint8Array.from(input.bytes) };
    const operation = this.#contentsWrites.then(() =>
      this.#putContent(stableInput),
    );
    this.#contentsWrites = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  async compare(input: {
    repository: string;
    base: "main";
    head: string;
  }): Promise<readonly GitHubChangedFile[]> {
    assertPublicationBranch(input.repository, input.head);
    invariant(
      input.base === "main",
      "delivery_base_invalid",
      "Public delivery base must be main",
    );
    const value = await this.#requestJson(
      input.repository,
      "GET",
      `/compare/${encodeURIComponent(input.base)}...${encodeURIComponent(input.head)}`,
    );
    const object = record(value);
    invariant(
      Array.isArray(object.files),
      "github_response_invalid",
      "GitHub compare response omitted its changed files",
    );
    return object.files.map(parseChangedFile);
  }

  async listPullRequests(input: {
    repository: string;
    base: "main";
    head: string;
    state: "all";
  }): Promise<readonly GitHubPullRequest[]> {
    const { owner } = assertPublicationBranch(
      input.repository,
      input.head,
    );
    invariant(
      input.base === "main" && input.state === "all",
      "delivery_pull_request_query_invalid",
      "Public delivery pull requests must be queried across all states against main",
    );
    const query = new URLSearchParams({
      state: "all",
      head: `${owner}:${input.head}`,
      base: "main",
      per_page: "100",
    });
    const value = await this.#requestJson(
      input.repository,
      "GET",
      `/pulls?${query.toString()}`,
    );
    invariant(
      Array.isArray(value),
      "github_response_invalid",
      "GitHub pull request list response is invalid",
    );
    return value.map((entry) => parsePullRequest(entry, input.head));
  }

  async listPullRequestFiles(input: {
    repository: string;
    pullRequestNumber: number;
  }): Promise<readonly GitHubChangedFile[]> {
    assertRepository(input.repository);
    assertPullRequestNumber(input.pullRequestNumber);
    const value = await this.#requestJson(
      input.repository,
      "GET",
      `/pulls/${input.pullRequestNumber}/files?per_page=100`,
    );
    invariant(
      Array.isArray(value),
      "github_response_invalid",
      "GitHub pull request files response is invalid",
    );
    return value.map(parseChangedFile);
  }

  async createPullRequest(input: {
    repository: string;
    base: "main";
    head: string;
    title: string;
    body: string;
  }): Promise<GitHubPullRequest> {
    assertPublicationBranch(input.repository, input.head);
    invariant(
      input.base === "main" &&
        input.title.trim().length > 0 &&
        input.body.trim().length > 0,
      "delivery_pull_request_invalid",
      "Public delivery pull request input is invalid",
    );
    const value = await this.#requestJson(
      input.repository,
      "POST",
      "/pulls",
      {
        body: {
          title: input.title,
          body: input.body,
          head: input.head,
          base: input.base,
        },
      },
    );
    return parsePullRequest(value, input.head);
  }

  async #readBranch(
    repository: string,
    branch: string,
    allowNotFound: boolean,
  ): Promise<GitHubBranch | undefined> {
    const value = await this.#requestJson(
      repository,
      "GET",
      `/git/ref/${encodeRef(branch)}`,
      { allowNotFound },
    );
    return value === undefined ? undefined : parseBranch(value, branch);
  }

  async #putContent(input: {
    repository: string;
    path: string;
    branch: string;
    bytes: Uint8Array;
    message: string;
  }): Promise<GitHubBranch> {
    const value = await this.#requestJson(
      input.repository,
      "PUT",
      `/contents/${encodePath(input.path)}`,
      {
        body: {
          message: input.message,
          content: Buffer.from(input.bytes).toString("base64"),
          branch: input.branch,
        },
      },
    );
    const object = record(value);
    const content = record(object.content);
    const commit = record(object.commit);
    invariant(
      content.type === "file" &&
        content.path === input.path &&
        typeof content.sha === "string" &&
        typeof commit.sha === "string",
      "github_response_invalid",
      "GitHub content write response is invalid",
    );
    assertCommitSha(content.sha);
    assertCommitSha(commit.sha);
    return { name: input.branch, sha: commit.sha };
  }

  async #requestJson(
    repository: string,
    method: "GET" | "POST" | "PUT",
    path: string,
    options: { body?: unknown; allowNotFound?: boolean } = {},
  ): Promise<unknown | undefined> {
    const response = await this.#fetch(
      `${this.#apiBaseUrl}/repos/${encodeRepository(repository)}${path}`,
      {
        method,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${this.#token}`,
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
          ...(options.body === undefined
            ? {}
            : { "Content-Type": "application/json" }),
        },
        ...(options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
      },
    );
    if (options.allowNotFound && response.status === 404) return undefined;
    invariant(
      response.ok,
      "github_request_failed",
      `GitHub ${method} ${path.split("?")[0]} failed with HTTP ${response.status}`,
    );
    try {
      return await response.json();
    } catch (error) {
      invariant(
        false,
        "github_response_invalid",
        `GitHub ${method} ${path.split("?")[0]} returned invalid JSON: ${
          error instanceof Error ? error.name : "parse error"
        }`,
      );
    }
  }
}

function parseBranch(value: unknown, expectedName: string): GitHubBranch {
  const object = record(value);
  const target = record(object.object);
  invariant(
    object.ref === `refs/heads/${expectedName}` &&
      target.type === "commit" &&
      typeof target.sha === "string",
    "github_response_invalid",
    "GitHub branch response is invalid",
  );
  assertCommitSha(target.sha);
  return { name: expectedName, sha: target.sha };
}

function parseContent(value: unknown, expectedPath: string): GitHubContent {
  const object = record(value);
  invariant(
    object.type === "file" &&
      object.path === expectedPath &&
      typeof object.sha === "string" &&
      object.encoding === "base64" &&
      typeof object.content === "string",
    "github_response_invalid",
    "GitHub content response is invalid",
  );
  assertCommitSha(object.sha);
  const encoded = object.content.replace(/\s+/g, "");
  const bytes = Buffer.from(encoded, "base64");
  invariant(
    bytes.toString("base64").replace(/=+$/, "") ===
      encoded.replace(/=+$/, ""),
    "github_response_invalid",
    "GitHub content response contains invalid base64",
  );
  return {
    path: expectedPath,
    bytes: Uint8Array.from(bytes),
    blobSha: object.sha,
  };
}

function parseChangedFile(value: unknown): GitHubChangedFile {
  const object = record(value);
  invariant(
    typeof object.filename === "string" &&
      object.filename.length > 0 &&
      typeof object.status === "string" &&
      object.status.length > 0,
    "github_response_invalid",
    "GitHub changed-file response is invalid",
  );
  return { path: object.filename, status: object.status };
}

function parsePullRequest(
  value: unknown,
  expectedHead: string,
): GitHubPullRequest {
  const object = record(value);
  const base = record(object.base);
  const head = record(object.head);
  invariant(
    Number.isInteger(object.number) &&
      (object.number as number) > 0 &&
      typeof object.html_url === "string" &&
      /^https:\/\//.test(object.html_url) &&
      typeof object.title === "string" &&
      typeof object.body === "string" &&
      (object.state === "open" || object.state === "closed") &&
      base.ref === "main" &&
      head.ref === expectedHead &&
      typeof head.sha === "string" &&
      (object.merged_at === null ||
        object.merged_at === undefined ||
        typeof object.merged_at === "string"),
    "github_response_invalid",
    "GitHub pull request response is invalid",
  );
  assertCommitSha(head.sha);
  return {
    number: object.number as number,
    url: object.html_url,
    title: object.title,
    body: object.body,
    state: object.state,
    merged: typeof object.merged_at === "string",
    base: "main",
    head: expectedHead,
    headSha: head.sha,
  };
}

function record(value: unknown): Record<string, unknown> {
  invariant(
    value !== null && typeof value === "object" && !Array.isArray(value),
    "github_response_invalid",
    "GitHub response is not an object",
  );
  return value as Record<string, unknown>;
}

function assertRepository(repository: string): { owner: string; name: string } {
  const [owner, name, extra] = repository.split("/");
  invariant(
    owner !== undefined &&
      name !== undefined &&
      extra === undefined &&
      /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner) &&
      /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) &&
      name !== "." &&
      name !== "..",
    "delivery_repository_invalid",
    "Public delivery repository must be an explicit owner/name pair",
  );
  return { owner, name };
}

function assertPublicationBranch(
  repository: string,
  branch: string,
): { owner: string; name: string; slug: string } {
  const parsed = assertRepository(repository);
  const match = /^deepgeno\/publish\/([a-z0-9][a-z0-9-]*)$/.exec(branch);
  invariant(
    match?.[1],
    "delivery_branch_invalid",
    "Public delivery branch must be the deterministic publication branch",
  );
  const slug = match[1];
  assertGitHubDeliveryCoordinates({
    repository,
    base: "main",
    branch,
    slug,
    path: `content/public/papers/${slug}.md`,
  });
  return { ...parsed, slug };
}

function assertContentCoordinates(
  repository: string,
  path: string,
  ref: string,
  allowMain: boolean,
): void {
  if (ref === "main") {
    invariant(
      allowMain,
      "delivery_branch_invalid",
      "Public delivery may never write directly to main",
    );
    const match = /^content\/public\/papers\/([a-z0-9][a-z0-9-]*)\.md$/.exec(
      path,
    );
    invariant(
      match?.[1],
      "delivery_path_invalid",
      "Public delivery path is invalid",
    );
    assertRepository(repository);
    return;
  }
  const { slug } = assertPublicationBranch(repository, ref);
  assertGitHubDeliveryCoordinates({
    repository,
    base: "main",
    branch: ref,
    slug,
    path,
  });
}

function assertCommitSha(value: string): void {
  invariant(
    /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value),
    "github_response_invalid",
    "GitHub response contains an invalid commit SHA",
  );
}

function assertPullRequestNumber(value: number): void {
  invariant(
    Number.isInteger(value) && value > 0,
    "delivery_pull_request_invalid",
    "GitHub pull request number must be positive",
  );
}

function encodeRepository(repository: string): string {
  const { owner, name } = assertRepository(repository);
  return `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

function encodeRef(branch: string): string {
  return ["heads", ...branch.split("/")].map(encodeURIComponent).join("/");
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}
