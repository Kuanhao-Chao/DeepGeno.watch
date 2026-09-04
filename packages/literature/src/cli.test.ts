import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  configuredModel,
  main,
  resolveCliRoots,
  resolvePublicDeliveryConfig,
} from "./cli.js";
import { GitFileStateStore } from "./store.js";
import { parseCandidateReview, renderCandidateReview } from "./review.js";
import { createLiteratureLifecycle } from "./lifecycle.js";
import { FixtureSource } from "./sources/fixture.js";

const roots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("literature CLI roots", () => {
  it("constructs the explicitly configured Cloudflare Workers AI model", () => {
    const model = configuredModel({
      DEEPGENO_MODEL_PROVIDER: "cloudflare-workers-ai",
      DEEPGENO_MODEL_NAME: "@cf/google/gemma-4-26b-a4b-it",
      DEEPGENO_MODEL_MAX_OUTPUT_TOKENS: "5000",
      CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
      CLOUDFLARE_AI_API_TOKEN: "private-cloudflare-token",
    });

    expect(model).toMatchObject({
      provider: "cloudflare-workers-ai",
      model: "@cf/google/gemma-4-26b-a4b-it",
    });
  });

  it("resolves each new CLI root ahead of its environment variable", () => {
    expect(
      resolveCliRoots("publish", {
        flags: {
          "project-root": "cli-project",
          "state-root": "cli-state",
          root: "legacy-root",
        },
        environment: {
          DEEPGENO_PROJECT_ROOT: "env-project",
          DEEPGENO_STATE_ROOT: "env-state",
        },
        cwd: "/working-directory",
      }),
    ).toEqual({
      projectRoot: path.resolve("/working-directory", "cli-project"),
      stateRoot: path.resolve("/working-directory", "cli-state"),
    });
  });

  it("uses environment roots before the legacy local root alias", () => {
    expect(
      resolveCliRoots("publish", {
        flags: { root: "legacy-root" },
        environment: {
          DEEPGENO_PROJECT_ROOT: "env-project",
          DEEPGENO_STATE_ROOT: "env-state",
        },
        cwd: "/working-directory",
      }),
    ).toEqual({
      projectRoot: path.resolve("/working-directory", "env-project"),
      stateRoot: path.resolve("/working-directory", "env-state"),
    });
  });

  it("keeps --root as a local alias for both roots", () => {
    expect(
      resolveCliRoots("discover", {
        flags: { root: "legacy-root" },
        environment: {},
        cwd: "/working-directory",
      }),
    ).toEqual({
      projectRoot: path.resolve("/working-directory", "legacy-root"),
      stateRoot: path.resolve("/working-directory", "legacy-root"),
    });
  });

  it("fails closed in GitHub Actions when only --root is provided", () => {
    expect(() =>
      resolveCliRoots("publish", {
        flags: { root: "legacy-root" },
        environment: { GITHUB_ACTIONS: "true" },
        cwd: "/working-directory",
      }),
    ).toThrowError(expect.objectContaining({ code: "state_root_required" }));
  });

  it("rejects a state-root environment variable without an Actions flag", () => {
    expect(() =>
      resolveCliRoots("publish", {
        flags: { "project-root": "project" },
        environment: {
          GITHUB_ACTIONS: "true",
          DEEPGENO_STATE_ROOT: "private-state",
        },
        cwd: "/working-directory",
      }),
    ).toThrowError(expect.objectContaining({ code: "state_root_required" }));
  });

  it("accepts an explicit state-root flag in GitHub Actions", () => {
    expect(
      resolveCliRoots("publish", {
        flags: { "project-root": "project", "state-root": "private-state" },
        environment: { GITHUB_ACTIONS: "true" },
        cwd: "/working-directory",
      }),
    ).toEqual({
      projectRoot: path.resolve("/working-directory", "project"),
      stateRoot: path.resolve("/working-directory", "private-state"),
    });
  });

  it("requires explicit public repository and installation-token delivery configuration", () => {
    expect(
      resolvePublicDeliveryConfig({
        DEEPGENO_PUBLIC_REPOSITORY: "example/deepgeno-watch",
        DEEPGENO_PUBLIC_GITHUB_TOKEN: "installation-token",
      }),
    ).toEqual({
      repository: "example/deepgeno-watch",
      token: "installation-token",
    });
    expect(() =>
      resolvePublicDeliveryConfig({
        DEEPGENO_PUBLIC_REPOSITORY: "example/deepgeno-watch",
      }),
    ).toThrowError(expect.objectContaining({ code: "github_token_required" }));
    expect(() =>
      resolvePublicDeliveryConfig({
        DEEPGENO_PUBLIC_REPOSITORY: "main",
        DEEPGENO_PUBLIC_GITHUB_TOKEN: "installation-token",
      }),
    ).toThrowError(
      expect.objectContaining({ code: "delivery_repository_invalid" }),
    );
  });

  it("loads a sealed delivery before unrelated engine configuration", async () => {
    const stateRoot = await mkdtemp(path.join(tmpdir(), "deepgeno-cli-state-"));
    roots.push(stateRoot);
    vi.stubEnv("DEEPGENO_PUBLIC_REPOSITORY", "example/deepgeno-watch");
    vi.stubEnv("DEEPGENO_PUBLIC_GITHUB_TOKEN", "installation-token");

    await expect(
      main([
        "deliver",
        "--project-root",
        path.join(stateRoot, "missing-engine-config"),
        "--state-root",
        stateRoot,
        "--slug",
        "sealed-paper-a1b2c3d",
      ]),
    ).rejects.toMatchObject({ code: "publication_missing" });
  });

  it("loads config from project-root while reading state only from state-root", async () => {
    const stateRoot = await mkdtemp(path.join(tmpdir(), "deepgeno-cli-state-"));
    roots.push(stateRoot);
    const projectRoot = path.resolve(import.meta.dirname, "../../..");
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    await main([
      "project",
      "--project-root",
      projectRoot,
      "--state-root",
      stateRoot,
    ]);

    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      command: "project",
      publishedCount: 0,
      changedPaths: [],
    });
    expect(await readdir(stateRoot)).toEqual([]);
  });

  it("writes an apply-triage decision only to the explicit state root", async () => {
    const stateRoot = await mkdtemp(path.join(tmpdir(), "deepgeno-cli-state-"));
    roots.push(stateRoot);
    const projectRoot = path.resolve(import.meta.dirname, "../../..");
    const store = new GitFileStateStore(stateRoot);
    const seed = createLiteratureLifecycle({
      store,
      sources: [
        new FixtureSource([
          {
            source: "biorxiv",
            sourceId: "10.1101/2026.08.28.123456",
            title: "DNA model predicts enhancer activity",
            authors: ["Ada Genome"],
            abstract:
              "A genomic transformer predicts DNA regulatory sequence enhancer activity and gene expression across human cell types with strong benchmark results and computational genomics analysis.",
            publishedAt: "2026-08-28",
            url: "https://doi.org/10.1101/2026.08.28.123456",
            categories: ["bioinformatics"],
          },
        ]),
      ],
      clock: () => new Date("2026-08-28T07:00:00.000Z"),
      relevanceThreshold: 0.2,
    });
    const discovered = await seed.run({
      kind: "discover",
      from: "2026-08-28",
      to: "2026-08-28",
      trigger: "test",
    });
    if (discovered.command !== "discover")
      throw new Error("Unexpected discovery");
    const batch = await store.loadCandidateBatch(discovered.batchId);
    const bodyFile = path.join(stateRoot, "review.md");
    await writeFile(
      bodyFile,
      renderCandidateReview(batch).replace(
        "- [ ] Summarize",
        "- [x] Summarize",
      ),
      "utf8",
    );
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    await main([
      "apply-triage",
      "--project-root",
      projectRoot,
      "--state-root",
      stateRoot,
      "--batch",
      batch.id,
      "--body-file",
      bodyFile,
      "--actor-id",
      "curator",
      "--decided-at",
      "2026-08-28T07:00:00.000Z",
    ]);

    expect(JSON.parse(String(write.mock.calls.at(-1)?.[0]))).toMatchObject({
      command: "apply-triage",
      changedPaths: [
        expect.stringMatching(/^data\/private\/decisions\/candidates\//),
      ],
    });
    expect(
      await readdir(
        path.join(stateRoot, "data", "private", "decisions", "candidates"),
      ),
    ).toHaveLength(1);
    await expect(
      readdir(
        path.join(projectRoot, "data", "private", "decisions", "candidates"),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("prepares synthesis with cloudflare-workers-ai model provider", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "deepgeno-synthesis-"));
    roots.push(root);
    const store = new GitFileStateStore(root);
    const lifecycle = createLiteratureLifecycle({
      store,
      sources: [
        new FixtureSource([
          {
            source: "biorxiv",
            sourceId: "10.1101/2026.08.28.123456",
            title: "DNA model predicts enhancer activity",
            authors: ["Ada Genome"],
            abstract:
              "A genomic transformer predicts DNA regulatory sequence enhancer activity and gene expression across human cell types with strong benchmark results and computational genomics analysis.",
            publishedAt: "2026-08-28",
            url: "https://doi.org/10.1101/2026.08.28.123456",
            categories: ["bioinformatics"],
          },
        ]),
      ],
      clock: () => new Date("2026-08-28T07:00:00.000Z"),
      relevanceThreshold: 0.2,
      model: {
        provider: "cloudflare-workers-ai",
        model: "@cf/google/gemma-4-26b-a4b-it",
        generate: vi.fn(),
      },
    });

    const discovery = await lifecycle.run({
      kind: "discover",
      from: "2026-08-28",
      to: "2026-08-28",
      trigger: "test",
    });
    if (discovery.command !== "discover") throw new Error("Unexpected report");
    const batch = await store.loadCandidateBatch(discovery.batchId);
    const projection = await lifecycle.project({
      kind: "candidate-inbox",
      batchId: batch.id,
    });
    if (projection.kind !== "candidate-inbox")
      throw new Error("Unexpected projection");
    const decision = parseCandidateReview(
      projection.markdown.replace("- [ ] Summarize", "- [x] Summarize"),
      batch,
      {
        actor: { id: "curator", kind: "human" },
        decidedAt: "2026-08-28T07:00:00.000Z",
      },
    );
    await lifecycle.applyDecisions(decision);

    const prepared = await lifecycle.run({
      kind: "prepare-synthesis",
      paperId: batch.candidates[0]!.paper.id,
    });
    expect(prepared).toMatchObject({
      command: "prepare-synthesis",
      requestState: "prepared",
    });
  });
});
