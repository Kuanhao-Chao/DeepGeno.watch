import { describe, expect, it } from "vitest";

import { GitHubRestDeliveryAdapter } from "./github-rest.js";

const repository = "example/deepgeno-watch";
const slug = "sealed-paper-a1b2c3d";
const branch = `deepgeno/publish/${slug}`;
const paperPath = `content/public/papers/${slug}.md`;

describe("GitHubRestDeliveryAdapter", () => {
  it("uses the pinned REST contract and base64-encodes bytes only at the HTTP edge", async () => {
    const requests: Request[] = [];
    const responses = [
      jsonResponse({
        ref: "refs/heads/main",
        object: { type: "commit", sha: "a".repeat(40) },
      }),
      jsonResponse({
        ref: `refs/heads/${branch}`,
        object: { type: "commit", sha: "a".repeat(40) },
      }),
      jsonResponse({ sha: "a".repeat(40), tree: { sha: "d".repeat(40) } }),
      jsonResponse({ sha: "e".repeat(40) }),
      jsonResponse({ sha: "f".repeat(40) }),
      jsonResponse({
        sha: "b".repeat(40),
        tree: { sha: "f".repeat(40) },
        parents: [{ sha: "a".repeat(40) }],
      }),
      jsonResponse({
        ref: `refs/heads/${branch}`,
        object: { type: "commit", sha: "b".repeat(40) },
      }),
      jsonResponse({
        ref: `refs/heads/${branch}`,
        object: { type: "commit", sha: "b".repeat(40) },
      }),
      jsonResponse({ sha: "b".repeat(40), tree: { sha: "d".repeat(40) } }),
      treeResponse("d", "content", "a", "tree", "040000"),
      treeResponse("a", "public", "b", "tree", "040000"),
      treeResponse("b", "papers", "c", "tree", "040000"),
      treeResponse("c", `${slug}.md`, "e", "blob", "100644"),
      jsonResponse({
        sha: "e".repeat(40),
        type: "file",
        encoding: "base64",
        content: Buffer.from("exact sealed bytes").toString("base64"),
      }),
      jsonResponse({ files: [{ filename: paperPath, status: "added" }] }),
      jsonResponse([]),
      jsonResponse({
        number: 7,
        html_url: `https://github.com/${repository}/pull/7`,
        title: "Literature update: Public sequence model",
        body: "Public allowlisted body",
        state: "open",
        merged_at: null,
        base: { ref: "main" },
        head: { ref: branch, sha: "b".repeat(40) },
      }),
      jsonResponse([{ filename: paperPath, status: "added" }]),
    ];
    const adapter = new GitHubRestDeliveryAdapter({
      token: "installation-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        const response = responses.shift();
        if (!response) throw new Error("unexpected request");
        return response;
      },
    });

    await expect(
      adapter.getBaseBranch({ repository, base: "main" }),
    ).resolves.toEqual({ name: "main", sha: "a".repeat(40) });
    await adapter.createBranch({
      repository,
      branch,
      fromSha: "a".repeat(40),
    });
    await adapter.putContent({
      repository,
      path: paperPath,
      branch,
      expectedHeadSha: "a".repeat(40),
      bytes: new TextEncoder().encode("exact sealed bytes"),
      message: `Add literature summary: ${slug}`,
    });
    await expect(
      adapter.getContent({ repository, path: paperPath, ref: branch }),
    ).resolves.toMatchObject({
      path: paperPath,
      bytes: new TextEncoder().encode("exact sealed bytes"),
    });
    await expect(
      adapter.compare({ repository, base: "main", head: branch }),
    ).resolves.toEqual([{ path: paperPath, status: "added" }]);
    await adapter.listPullRequests({
      repository,
      base: "main",
      head: branch,
      state: "all",
    });
    await adapter.createPullRequest({
      repository,
      base: "main",
      head: branch,
      title: "Literature update: Public sequence model",
      body: "Public allowlisted body",
    });
    await adapter.listPullRequestFiles({
      repository,
      pullRequestNumber: 7,
    });

    expect(requests).toHaveLength(18);
    for (const request of requests) {
      expect(request.headers.get("authorization")).toBe(
        "Bearer installation-token",
      );
      expect(request.headers.get("x-github-api-version")).toBe("2026-03-10");
      expect(request.headers.get("accept")).toBe("application/vnd.github+json");
    }
    expect(requests[0]!.url).toBe(
      `https://api.github.com/repos/${repository}/git/ref/heads/main`,
    );
    expect(await requests[1]!.json()).toEqual({
      ref: `refs/heads/${branch}`,
      sha: "a".repeat(40),
    });
    expect(await requests[3]!.json()).toEqual({
      content: Buffer.from("exact sealed bytes").toString("base64"),
      encoding: "base64",
    });
    expect(await requests[4]!.json()).toEqual({
      base_tree: "d".repeat(40),
      tree: [
        { path: paperPath, mode: "100644", type: "blob", sha: "e".repeat(40) },
      ],
    });
    expect(await requests[6]!.json()).toEqual({
      sha: "b".repeat(40),
      force: false,
    });
    expect(requests[15]!.url).toContain("state=all");
    expect(requests[15]!.url).toContain(
      `head=${encodeURIComponent(`example:${branch}`)}`,
    );
    expect(requests[15]!.url).toContain("base=main");
  });

  it("serializes concurrent atomic Git-object writes", async () => {
    let activeWrites = 0;
    let maximumActiveWrites = 0;
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let requestCount = 0;
    const adapter = new GitHubRestDeliveryAdapter({
      token: "installation-token",
      fetch: async () => {
        requestCount += 1;
        activeWrites += 1;
        maximumActiveWrites = Math.max(maximumActiveWrites, activeWrites);
        if (requestCount === 1) await firstGate;
        activeWrites -= 1;
        const phase = requestCount % 5;
        if (phase === 1)
          return jsonResponse({
            sha: "a".repeat(40),
            tree: { sha: "d".repeat(40) },
          });
        if (phase === 2) return jsonResponse({ sha: "e".repeat(40) });
        if (phase === 3) return jsonResponse({ sha: "f".repeat(40) });
        if (phase === 4)
          return jsonResponse({
            sha: "b".repeat(40),
            tree: { sha: "f".repeat(40) },
            parents: [{ sha: "a".repeat(40) }],
          });
        return jsonResponse({
          ref: `refs/heads/${branch}`,
          object: { type: "commit", sha: "b".repeat(40) },
        });
      },
    });

    const first = adapter.putContent({
      repository,
      path: paperPath,
      branch,
      expectedHeadSha: "a".repeat(40),
      bytes: new TextEncoder().encode("first"),
      message: "first",
    });
    const second = adapter.putContent({
      repository,
      path: paperPath,
      branch,
      expectedHeadSha: "a".repeat(40),
      bytes: new TextEncoder().encode("second"),
      message: "second",
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(requestCount).toBe(1);
    releaseFirst();
    await Promise.all([first, second]);
    expect(maximumActiveWrites).toBe(1);
    expect(requestCount).toBe(10);
  });

  it("refuses direct-main writes and malformed GitHub responses before trusting them", async () => {
    let calls = 0;
    const adapter = new GitHubRestDeliveryAdapter({
      token: "installation-token",
      fetch: async () => {
        calls += 1;
        return jsonResponse({ ref: "wrong", object: { sha: "bad" } });
      },
    });

    await expect(
      adapter.putContent({
        repository,
        path: paperPath,
        branch: "main",
        expectedHeadSha: "a".repeat(40),
        bytes: new Uint8Array(),
        message: "forbidden",
      }),
    ).rejects.toMatchObject({ code: "delivery_branch_invalid" });
    expect(calls).toBe(0);

    await expect(
      adapter.getBaseBranch({ repository, base: "main" }),
    ).rejects.toMatchObject({ code: "github_response_invalid" });
    expect(calls).toBe(1);
  });

  it("rejects noncanonical commit SHA lengths in GitHub responses", async () => {
    const adapter = new GitHubRestDeliveryAdapter({
      token: "installation-token",
      fetch: async () =>
        jsonResponse({
          ref: "refs/heads/main",
          object: { type: "commit", sha: "a".repeat(41) },
        }),
    });

    await expect(
      adapter.getBaseBranch({ repository, base: "main" }),
    ).rejects.toMatchObject({ code: "github_response_invalid" });
  });

  it.each([
    { tree: { sha: "d".repeat(40) } },
    { sha: "c".repeat(40), tree: { sha: "d".repeat(40) } },
  ])(
    "requires Git commit reads to identify the requested commit exactly",
    async (commit) => {
      const responses = gitReadResponses("blob", "100644");
      responses[1] = jsonResponse(commit);
      const adapter = new GitHubRestDeliveryAdapter({
        token: "installation-token",
        fetch: async () => responses.shift() ?? jsonResponse({}),
      });

      await expect(
        adapter.getContent({ repository, path: paperPath, ref: branch }),
      ).rejects.toMatchObject({ code: "github_response_invalid" });
    },
  );

  it.each([
    ["symlink", "blob", "120000"],
    ["executable", "blob", "100755"],
    ["submodule", "commit", "160000"],
  ])(
    "refuses a %s entry even when it names the sealed path",
    async (_name, type, mode) => {
      const responses = gitReadResponses(type, mode);
      const adapter = new GitHubRestDeliveryAdapter({
        token: "installation-token",
        fetch: async () => responses.shift() ?? jsonResponse({}),
      });

      await expect(
        adapter.getContent({ repository, path: paperPath, ref: branch }),
      ).rejects.toMatchObject({ code: "github_content_not_regular_file" });
    },
  );

  it("returns missing tree entries as absent and rejects malformed target entries", async () => {
    const missing = gitReadResponses("blob", "100644");
    missing[5] = treeResponse("c", "other.md", "e", "blob", "100644");
    const missingAdapter = new GitHubRestDeliveryAdapter({
      token: "installation-token",
      fetch: async () => missing.shift() ?? jsonResponse({}),
    });
    await expect(
      missingAdapter.getContent({ repository, path: paperPath, ref: branch }),
    ).resolves.toBeUndefined();

    const malformed = gitReadResponses("blob", "100644");
    malformed[5] = jsonResponse({
      sha: "c".repeat(40),
      truncated: false,
      tree: [{ path: `${slug}.md`, mode: "100644", type: "blob" }],
    });
    const malformedAdapter = new GitHubRestDeliveryAdapter({
      token: "installation-token",
      fetch: async () => malformed.shift() ?? jsonResponse({}),
    });
    await expect(
      malformedAdapter.getContent({ repository, path: paperPath, ref: branch }),
    ).rejects.toMatchObject({ code: "github_response_invalid" });
  });

  it("retains rename source paths so the coordinator can reject non-additive diffs", async () => {
    const adapter = new GitHubRestDeliveryAdapter({
      token: "installation-token",
      fetch: async () =>
        jsonResponse({
          files: [
            {
              filename: paperPath,
              previous_filename: "content/public/papers/old.md",
              status: "renamed",
            },
          ],
        }),
    });
    await expect(
      adapter.compare({ repository, base: "main", head: branch }),
    ).resolves.toEqual([
      {
        path: paperPath,
        previousPath: "content/public/papers/old.md",
        status: "renamed",
      },
    ]);
  });
});

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

function treeResponse(
  shaLetter: string,
  path: string,
  childLetter: string,
  type: string,
  mode: string,
): Response {
  return jsonResponse({
    sha: shaLetter.repeat(40),
    truncated: false,
    tree: [
      {
        path,
        sha: childLetter.repeat(40),
        type,
        mode,
      },
    ],
  });
}

function gitReadResponses(type: string, mode: string): Response[] {
  return [
    jsonResponse({
      ref: `refs/heads/${branch}`,
      object: { type: "commit", sha: "b".repeat(40) },
    }),
    jsonResponse({ sha: "b".repeat(40), tree: { sha: "d".repeat(40) } }),
    treeResponse("d", "content", "a", "tree", "040000"),
    treeResponse("a", "public", "b", "tree", "040000"),
    treeResponse("b", "papers", "c", "tree", "040000"),
    treeResponse("c", `${slug}.md`, "e", type, mode),
  ];
}
