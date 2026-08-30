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
      jsonResponse({
        content: { type: "file", path: paperPath, sha: "c".repeat(40) },
        commit: { sha: "b".repeat(40) },
      }),
      jsonResponse({
        type: "file",
        path: paperPath,
        sha: "c".repeat(40),
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

    expect(requests).toHaveLength(8);
    for (const request of requests) {
      expect(request.headers.get("authorization")).toBe(
        "Bearer installation-token",
      );
      expect(request.headers.get("x-github-api-version")).toBe("2026-03-10");
      expect(request.headers.get("accept")).toBe(
        "application/vnd.github+json",
      );
    }
    expect(requests[0]!.url).toBe(
      `https://api.github.com/repos/${repository}/git/ref/heads/main`,
    );
    expect(await requests[1]!.json()).toEqual({
      ref: `refs/heads/${branch}`,
      sha: "a".repeat(40),
    });
    expect(await requests[2]!.json()).toEqual({
      message: `Add literature summary: ${slug}`,
      content: Buffer.from("exact sealed bytes").toString("base64"),
      branch,
    });
    expect(requests[5]!.url).toContain("state=all");
    expect(requests[5]!.url).toContain(
      `head=${encodeURIComponent(`example:${branch}`)}`,
    );
    expect(requests[5]!.url).toContain("base=main");
  });

  it("serializes concurrent Contents API writes", async () => {
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
        return jsonResponse({
          content: { type: "file", path: paperPath, sha: "c".repeat(40) },
          commit: { sha: "b".repeat(40) },
        });
      },
    });

    const first = adapter.putContent({
      repository,
      path: paperPath,
      branch,
      bytes: new TextEncoder().encode("first"),
      message: "first",
    });
    const second = adapter.putContent({
      repository,
      path: paperPath,
      branch,
      bytes: new TextEncoder().encode("second"),
      message: "second",
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(requestCount).toBe(1);
    releaseFirst();
    await Promise.all([first, second]);
    expect(maximumActiveWrites).toBe(1);
    expect(requestCount).toBe(2);
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
});

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}
