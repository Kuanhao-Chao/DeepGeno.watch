import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PublishedPaper, TechnicalSummary } from "@deepgeno/contracts";
import {
  createLiteratureLifecycle,
  type LiteratureLifecycle,
  type RunReport,
} from "./lifecycle.js";
import { FakeStructuredModel } from "./models/fake.js";
import {
  projectionFromRelease,
  type Delivery,
  type PrivateRelease,
} from "./release.js";
import type {
  LiteratureSource,
  MetadataEnricher,
  SourceDocument,
  StructuredModelRequest,
} from "./ports.js";
import { parseCandidateReview, parseDraftReview } from "./review.js";
import { FixtureSource } from "./sources/fixture.js";
import { GitFileStateStore } from "./store.js";
import { sha256, stableJson } from "./util.js";

const roots: string[] = [];
const now = "2026-08-28T07:00:00.000Z";

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("LiteratureLifecycle", () => {
  it("persists preparation and one-use arming before model dispatch", async () => {
    let modelCalls = 0;
    const fixture = await selectedLifecycle(
      new FakeStructuredModel(() => {
        modelCalls += 1;
        return summaryFixture("abstract-only");
      }),
    );

    const prepared = await fixture.lifecycle.run({
      kind: "prepare-synthesis",
      paperId: fixture.paperId,
    });
    expect(prepared).toMatchObject({
      command: "prepare-synthesis",
      requestState: "prepared",
    });
    expect(modelCalls).toBe(0);
    if (prepared.command !== "prepare-synthesis")
      throw new Error("Unexpected report");

    const armed = await fixture.lifecycle.run({
      kind: "arm-synthesis",
      requestId: prepared.requestId,
    });
    expect(armed).toMatchObject({
      command: "arm-synthesis",
      requestId: prepared.requestId,
    });
    if (armed.command !== "arm-synthesis") throw new Error("Unexpected report");
    expect(armed.executionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(modelCalls).toBe(0);
    const armedRecord = await readFile(
      fixture.store.synthesisRequestPath(prepared.requestId),
      "utf8",
    );
    expect(armedRecord).not.toContain(armed.executionToken);
    expect(JSON.parse(armedRecord)).toMatchObject({
      state: "armed",
      executionTokenSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });

    await expect(
      fixture.lifecycle.run({
        kind: "synthesize",
        requestId: prepared.requestId,
        executionToken: "wrong-one-use-token",
      }),
    ).rejects.toMatchObject({ code: "synthesis_execution_token_invalid" });
    expect(modelCalls).toBe(0);

    const completed = await fixture.lifecycle.run({
      kind: "synthesize",
      requestId: prepared.requestId,
      executionToken: armed.executionToken,
    });
    expect(completed).toMatchObject({
      command: "synthesize",
      requestId: prepared.requestId,
      outcome: "completed",
      paperId: fixture.paperId,
    });
    expect(modelCalls).toBe(1);
  });

  it("allows exactly one concurrent arming transition", async () => {
    let modelCalls = 0;
    const fixture = await selectedLifecycle(
      new FakeStructuredModel(() => {
        modelCalls += 1;
        return summaryFixture("abstract-only");
      }),
    );
    const prepared = await fixture.lifecycle.run({
      kind: "prepare-synthesis",
      paperId: fixture.paperId,
    });
    if (prepared.command !== "prepare-synthesis")
      throw new Error("Unexpected report");

    const attempts = await Promise.allSettled([
      fixture.lifecycle.run({
        kind: "arm-synthesis",
        requestId: prepared.requestId,
      }),
      fixture.lifecycle.run({
        kind: "arm-synthesis",
        requestId: prepared.requestId,
      }),
    ]);

    expect(
      attempts.filter((attempt) => attempt.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      attempts.filter((attempt) => attempt.status === "rejected"),
    ).toHaveLength(1);
    expect(
      attempts.find((attempt) => attempt.status === "rejected"),
    ).toMatchObject({
      reason: { code: "synthesis_reconciliation_required" },
    });
    expect(modelCalls).toBe(0);
    expect(
      await fixture.store.loadSynthesisRequest(prepared.requestId),
    ).toMatchObject({ state: "armed" });
  });

  it("rejects model configuration drift before arming", async () => {
    let modelCalls = 0;
    const fixture = await selectedLifecycle(
      new FakeStructuredModel(() => {
        modelCalls += 1;
        return summaryFixture("abstract-only");
      }, "prepared-model"),
    );
    const prepared = await fixture.lifecycle.run({
      kind: "prepare-synthesis",
      paperId: fixture.paperId,
    });
    if (prepared.command !== "prepare-synthesis")
      throw new Error("Unexpected report");
    const driftedLifecycle = createLiteratureLifecycle({
      store: fixture.store,
      sources: [new FixtureSource([sourceRecord({})])],
      model: new FakeStructuredModel(() => {
        modelCalls += 1;
        return summaryFixture("abstract-only");
      }, "different-model"),
      clock: () => new Date(now),
      relevanceThreshold: 0.2,
    });

    await expect(
      driftedLifecycle.run({
        kind: "prepare-synthesis",
        paperId: fixture.paperId,
      }),
    ).rejects.toMatchObject({ code: "synthesis_model_mismatch" });
    expect(modelCalls).toBe(0);
    expect(
      await fixture.store.loadSynthesisRequest(prepared.requestId),
    ).toMatchObject({ state: "prepared", model: "prepared-model" });
  });

  it("fails closed after an ambiguous provider outcome until explicit CAS reconciliation", async () => {
    let modelCalls = 0;
    const idempotencyKeys: Array<string | undefined> = [];
    const fixture = await selectedLifecycle(
      new FakeStructuredModel((request: StructuredModelRequest) => {
        modelCalls += 1;
        idempotencyKeys.push(request.idempotencyKey);
        if (modelCalls === 1)
          throw new Error("timeout after the provider accepted the request");
        return summaryFixture("abstract-only");
      }),
    );

    const prepared = await fixture.lifecycle.run({
      kind: "prepare-synthesis",
      paperId: fixture.paperId,
    });
    if (prepared.command !== "prepare-synthesis")
      throw new Error("Unexpected report");
    const armed = await fixture.lifecycle.run({
      kind: "arm-synthesis",
      requestId: prepared.requestId,
    });
    if (armed.command !== "arm-synthesis") throw new Error("Unexpected report");

    const ambiguous = await fixture.lifecycle.run({
      kind: "synthesize",
      requestId: prepared.requestId,
      executionToken: armed.executionToken,
    });
    expect(ambiguous).toMatchObject({
      command: "synthesize",
      requestId: prepared.requestId,
      outcome: "ambiguous",
    });
    expect(modelCalls).toBe(1);
    const ambiguousRequest = await fixture.store.loadSynthesisRequest(
      prepared.requestId,
    );
    expect(ambiguousRequest).toMatchObject({ state: "ambiguous" });
    if (!ambiguousRequest) throw new Error("Expected an ambiguous request");

    await expect(
      fixture.lifecycle.run({
        kind: "prepare-synthesis",
        paperId: fixture.paperId,
      }),
    ).rejects.toMatchObject({ code: "synthesis_reconciliation_required" });
    await expect(
      fixture.lifecycle.run({
        kind: "arm-synthesis",
        requestId: prepared.requestId,
      }),
    ).rejects.toMatchObject({ code: "synthesis_reconciliation_required" });
    await expect(
      fixture.lifecycle.run({
        kind: "synthesize",
        requestId: prepared.requestId,
        executionToken: armed.executionToken,
      }),
    ).rejects.toMatchObject({ code: "synthesis_reconciliation_required" });
    expect(modelCalls).toBe(1);

    await expect(
      fixture.lifecycle.run({
        kind: "reconcile-synthesis",
        requestId: prepared.requestId,
        expectedUpdatedAt: "not-an-iso-timestamp",
        note: "Provider records confirm no completed response.",
      }),
    ).rejects.toMatchObject({ code: "synthesis_timestamp_invalid" });
    await expect(
      fixture.lifecycle.run({
        kind: "reconcile-synthesis",
        requestId: prepared.requestId,
        expectedUpdatedAt: "2026-08-28T06:59:59.000Z",
        note: "Provider records confirm no completed response.",
      }),
    ).rejects.toMatchObject({ code: "synthesis_reconciliation_stale" });

    const reconciled = await fixture.lifecycle.run({
      kind: "reconcile-synthesis",
      requestId: prepared.requestId,
      expectedUpdatedAt: ambiguousRequest.updatedAt,
      note: "Provider records confirm no completed response.",
    });
    expect(reconciled).toMatchObject({
      command: "reconcile-synthesis",
      requestState: "prepared",
    });
    const rearmed = await fixture.lifecycle.run({
      kind: "arm-synthesis",
      requestId: prepared.requestId,
    });
    if (rearmed.command !== "arm-synthesis")
      throw new Error("Unexpected report");
    const completed = await fixture.lifecycle.run({
      kind: "synthesize",
      requestId: prepared.requestId,
      executionToken: rearmed.executionToken,
    });
    expect(completed).toMatchObject({
      command: "synthesize",
      outcome: "completed",
    });
    expect(modelCalls).toBe(2);
    expect(idempotencyKeys).toEqual([prepared.requestId, prepared.requestId]);
    expect(
      await fixture.store.loadSynthesisRequest(prepared.requestId),
    ).toMatchObject({
      state: "completed",
      reconciliations: [
        expect.objectContaining({
          priorState: "ambiguous",
          note: "Provider records confirm no completed response.",
        }),
      ],
    });
  });

  it("enforces both human gates and publishes one deduplicated evidence-backed paper", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "deepgeno-lifecycle-"));
    roots.push(root);
    const store = new FaultInjectingStore(root);
    const primary = sourceRecord({
      source: "biorxiv",
      sourceId: "10.1101/2026.08.28.123456",
    });
    const duplicate = sourceRecord({
      source: "arxiv",
      sourceId: "2608.12345",
      url: "https://arxiv.org/abs/2608.12345",
    });
    const incomplete = sourceRecord({
      source: "crossref",
      sourceId: "10.1000/incomplete",
      doi: "10.1000/incomplete",
      title: "A genomic transformer without an abstract",
      abstract: "Not available.",
    });
    let modelCalls = 0;
    const model = new FakeStructuredModel(() => {
      modelCalls += 1;
      return summaryFixture("full-text");
    });
    const lifecycle = createLiteratureLifecycle({
      store,
      sources: [
        new FixtureSource([primary, incomplete], "fixture-biorxiv"),
        new FixtureSource([duplicate], "fixture-arxiv"),
        failingSource,
      ],
      enrichers: [openTextEnricher, failingEnricher],
      model,
      clock: () => new Date(now),
      relevanceThreshold: 0.2,
    });

    const discovery = await lifecycle.run({
      kind: "discover",
      from: "2026-08-28",
      to: "2026-08-28",
      trigger: "test",
    });
    expect(discovery).toMatchObject({
      command: "discover",
      candidateCount: 1,
      batchRevision: 1,
    });
    if (discovery.command !== "discover") throw new Error("Unexpected report");
    expect(discovery.sourceIssues).toEqual([
      expect.objectContaining({
        source: "fixture-failure",
        code: "source_unavailable",
      }),
    ]);
    expect(await store.listCheckpoints()).toHaveLength(2);

    const batch = await store.loadCandidateBatch(discovery.batchId);
    expect(batch.candidates[0]?.paper.sourceRecords).toHaveLength(2);
    const paperId = batch.candidates[0]!.paper.id;

    await expect(
      lifecycle.run({ kind: "prepare-synthesis", paperId }),
    ).rejects.toMatchObject({
      code: "synthesis_not_selected",
    });
    expect(modelCalls).toBe(0);

    const candidateProjection = await lifecycle.project({
      kind: "candidate-inbox",
      batchId: batch.id,
    });
    if (candidateProjection.kind !== "candidate-inbox")
      throw new Error("Unexpected projection");
    const selectedBody = candidateProjection.markdown
      .replace("- [ ] Summarize", "- [x] Summarize")
      // This looks like an extra checked action but sits outside the bounded
      // control region and therefore cannot manipulate a decision.
      .concat("\n- [x] Dismiss\n");
    const triage = parseCandidateReview(selectedBody, batch, {
      actor: { id: "curator", displayName: "Curator", kind: "human" },
      decidedAt: now,
    });
    const triageReport = await lifecycle.applyDecisions(triage);
    expect(triageReport).toMatchObject({
      kind: "triage",
      selectedPaperIds: [paperId],
    });

    const synthesis = await synthesizeSelected(lifecycle, paperId);
    expect(modelCalls).toBe(1);
    expect(
      synthesis.changedPaths.every((entry) =>
        entry.startsWith("data/private/"),
      ),
    ).toBe(true);
    expect(
      synthesis.changedPaths.some((entry) =>
        entry.startsWith("content/public/"),
      ),
    ).toBe(false);

    const draft = await store.loadDraft(synthesis.draftId);
    expect(draft.evidence.scope).toBe("full-text");
    expect(draft.evidence.warnings).toContain(
      "fixture-failing-enricher enrichment was unavailable; synthesis continued with remaining evidence.",
    );
    expect(
      (await store.loadPaper(paperId)).enrichment.fullText,
    ).toBeUndefined();

    await expect(
      lifecycle.run({ kind: "publish", draftId: draft.id }),
    ).rejects.toMatchObject({ code: "publication_not_approved" });

    const draftProjection = await lifecycle.project({
      kind: "draft-inbox",
      draftId: draft.id,
    });
    if (draftProjection.kind !== "draft-inbox")
      throw new Error("Unexpected projection");
    expect(() =>
      parseDraftReview(
        draftProjection.markdown.replace(
          "- [ ] Request revision",
          "- [x] Request revision",
        ),
        draft,
        { actor: { id: "curator", kind: "human" }, decidedAt: now },
      ),
    ).toThrow(/requires revision feedback/);
    const revisionBody = draftProjection.markdown
      .replace("- [ ] Request revision", "- [x] Request revision")
      .replace(
        "Describe the requested technical changes here.",
        "Emphasize the held-out enhancer benchmark without inventing missing numbers.",
      );
    const revisionRequest = parseDraftReview(revisionBody, draft, {
      actor: { id: "curator", displayName: "Curator", kind: "human" },
      decidedAt: now,
    });
    expect(revisionRequest.decisions[0]).toMatchObject({
      action: "revise",
      note: "Emphasize the held-out enhancer benchmark without inventing missing numbers.",
    });
    await lifecycle.applyDecisions(revisionRequest);

    const revision = await synthesizeSelected(lifecycle, paperId, draft.id);
    expect(modelCalls).toBe(2);
    const revisedDraft = await store.loadDraft(revision.draftId);
    expect(revisedDraft).toMatchObject({
      revision: 2,
      supersedesDraftId: draft.id,
      evidence: { inputSha256: draft.evidence.inputSha256 },
    });

    const revisedProjection = await lifecycle.project({
      kind: "draft-inbox",
      draftId: revisedDraft.id,
    });
    if (revisedProjection.kind !== "draft-inbox")
      throw new Error("Unexpected projection");
    const approvedBody = revisedProjection.markdown
      .replace("- [ ] Approve and publish", "- [x] Approve and publish")
      .replace("- [ ] Must-Read", "- [x] Must-Read")
      .replace("- [x] Recommended", "- [ ] Recommended");
    const approval = parseDraftReview(approvedBody, revisedDraft, {
      actor: { id: "curator", displayName: "Curator", kind: "human" },
      decidedAt: now,
    });
    expect(approval.decisions[0]).toMatchObject({
      action: "approve",
      priority: "must-read",
      progress: "queued",
    });
    expect(() =>
      parseDraftReview(
        approvedBody.replace("- [ ] Notable", "- [x] Notable"),
        revisedDraft,
        {
          actor: { id: "curator", kind: "human" },
          decidedAt: now,
        },
      ),
    ).toThrow(/exactly one checked status/);
    await lifecycle.applyDecisions(approval);
    await store.saveDraftReviewContext({
      draftId: revisedDraft.id,
      pullRequestUrl: "https://github.com/example/deepgeno/pull/42",
      commitSha: "a".repeat(40),
    });

    store.failReleaseOnce = true;
    store.failDeliveryOnce = true;
    await expect(
      lifecycle.run({ kind: "publish", draftId: revisedDraft.id }),
    ).rejects.toMatchObject({ code: "fault_release" });
    await expect(
      lifecycle.run({ kind: "publish", draftId: revisedDraft.id }),
    ).rejects.toMatchObject({ code: "fault_delivery" });
    const publication = await lifecycle.run({
      kind: "publish",
      draftId: revisedDraft.id,
    });
    if (publication.command !== "publish") throw new Error("Unexpected report");
    expect(publication).toMatchObject({
      privatePublicationPath: expect.stringMatching(
        /^data\/private\/publications\/.+\.json$/,
      ),
      releasePath: expect.stringMatching(/^data\/private\/releases\/.+\.json$/),
      deliveryPath: expect.stringMatching(
        /^data\/private\/deliveries\/.+\.json$/,
      ),
      publicDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(publication.changedPaths).toEqual([publication.deliveryPath]);
    expect(await store.listPublications()).toHaveLength(1);
    expect(
      await readdir(path.join(root, "data", "private", "releases")),
    ).toHaveLength(1);
    expect(
      await readdir(path.join(root, "data", "private", "deliveries")),
    ).toHaveLength(1);
    const storedPublication = await store.loadPublication(publication.slug);
    if (!storedPublication) throw new Error("Expected publication");
    const release = await store.loadReleaseForPublication(
      publication.slug,
      storedPublication,
    );
    if (!release) throw new Error("Expected sealed release");
    const sealedMarkdown = new TextDecoder().decode(
      projectionFromRelease(release).bytes,
    );
    expect(sealedMarkdown).toContain("priority: must-read");
    expect(sealedMarkdown).not.toContain(primary.abstract);
    await expect(
      store.saveRelease(
        {
          ...release,
          createdAt: "2026-08-28T07:01:00.000Z",
        },
        storedPublication,
      ),
    ).rejects.toMatchObject({ code: "immutable_conflict" });
    const tamperedPublication = {
      ...storedPublication,
      updatedAt: "2026-08-29T07:00:00.000Z",
    };
    await writeFile(
      store.publicationPath(publication.slug),
      JSON.stringify(tamperedPublication),
      "utf8",
    );
    await expect(
      store.loadReleaseForPublication(publication.slug, tamperedPublication),
    ).rejects.toMatchObject({ code: "release_publication_mismatch" });
    await writeFile(
      store.publicationPath(publication.slug),
      JSON.stringify(storedPublication),
      "utf8",
    );
    await expect(
      readdir(path.join(root, "content", "public", "papers")),
    ).rejects.toMatchObject({ code: "ENOENT" });

    const refreshed = await store.loadPaper(paperId);
    refreshed.paper.title =
      "A refreshed title must not change publication identity";
    await store.savePaper(refreshed);

    const publishedReplay = await lifecycle.run({
      kind: "publish",
      draftId: revisedDraft.id,
    });
    expect(publishedReplay).toMatchObject({
      command: "publish",
      privatePublicationPath: publication.privatePublicationPath,
      releasePath: publication.releasePath,
      deliveryPath: publication.deliveryPath,
      publicDigest: publication.publicDigest,
      changedPaths: [],
    });

    const deliveryBefore = await store.loadDeliveryForRelease(release);
    if (!deliveryBefore) throw new Error("Expected delivery");
    const publicationBefore = await readFile(
      store.publicationPath(publication.slug),
      "utf8",
    );
    const releaseBefore = await readFile(store.releasePath(release), "utf8");
    const deliveryBeforeFile = await readFile(
      store.deliveryPath(deliveryBefore),
      "utf8",
    );
    const sealedBytesBefore = projectionFromRelease(release).bytes;
    const { recordSha256: _oldRecord, ...laterCore } = revisedDraft;
    const laterDraftCore = {
      ...laterCore,
      id: `${revisedDraft.id}-later`,
      revision: revisedDraft.revision + 1,
    };
    const laterDraft = {
      ...laterDraftCore,
      recordSha256: sha256(stableJson(laterDraftCore)),
    };
    await store.saveDraft(laterDraft);
    const laterProjection = await lifecycle.project({
      kind: "draft-inbox",
      draftId: laterDraft.id,
    });
    if (laterProjection.kind !== "draft-inbox")
      throw new Error("Unexpected projection");
    const laterApproval = parseDraftReview(
      laterProjection.markdown
        .replace("- [ ] Approve and publish", "- [x] Approve and publish")
        .replace("- [ ] Must-Read", "- [x] Must-Read")
        .replace("- [x] Recommended", "- [ ] Recommended"),
      laterDraft,
      { actor: { id: "curator", kind: "human" }, decidedAt: now },
    );
    await lifecycle.applyDecisions(laterApproval);
    await expect(
      lifecycle.run({ kind: "publish", draftId: laterDraft.id }),
    ).rejects.toMatchObject({ code: "publication_draft_mismatch" });
    expect(await store.listPublications()).toHaveLength(1);
    const publicationAfter = await store.loadPublication(publication.slug);
    if (!publicationAfter) throw new Error("Expected publication");
    const releaseAfter = await store.loadReleaseForPublication(
      publication.slug,
      publicationAfter,
    );
    if (!releaseAfter) throw new Error("Expected release");
    const deliveryAfter = await store.loadDeliveryForRelease(releaseAfter);
    expect(deliveryAfter).toEqual(deliveryBefore);
    expect(
      await readFile(store.publicationPath(publication.slug), "utf8"),
    ).toBe(publicationBefore);
    expect(await readFile(store.releasePath(releaseAfter), "utf8")).toBe(
      releaseBefore,
    );
    expect(await readFile(store.deliveryPath(deliveryBefore), "utf8")).toBe(
      deliveryBeforeFile,
    );
    expect(projectionFromRelease(releaseAfter).bytes).toEqual(
      sealedBytesBefore,
    );
    expect(
      await readdir(path.join(root, "data", "private", "releases")),
    ).toHaveLength(1);
    expect(
      await readdir(path.join(root, "data", "private", "deliveries")),
    ).toHaveLength(1);

    const catalog = await lifecycle.project({ kind: "public-catalog" });
    if (catalog.kind !== "public-catalog")
      throw new Error("Unexpected projection");
    expect(catalog.papers).toHaveLength(1);
    expect(catalog.papers[0]).toMatchObject({
      schemaVersion: "2.0",
      priority: "must-read",
      evidence: { scope: "full-text" },
      provenance: { review: { approvedAt: now } },
    });
    expect(catalog.papers[0]).not.toHaveProperty("paperId");

    const replay = await lifecycle.run({
      kind: "prepare-synthesis",
      paperId,
    });
    expect(replay).toMatchObject({
      command: "prepare-synthesis",
      requestState: "completed",
      changedPaths: [],
    });
    expect(modelCalls).toBe(2);
  });

  it("requires exactly one bounded review choice", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "deepgeno-review-"));
    roots.push(root);
    const store = new GitFileStateStore(root);
    const lifecycle = createLiteratureLifecycle({
      store,
      sources: [new FixtureSource([sourceRecord({})])],
      clock: () => new Date(now),
      relevanceThreshold: 0.2,
    });
    const report = await lifecycle.run({
      kind: "discover",
      from: "2026-08-28",
      to: "2026-08-28",
    });
    if (report.command !== "discover") throw new Error("Unexpected report");
    const batch = await store.loadCandidateBatch(report.batchId);
    const projection = await lifecycle.project({
      kind: "candidate-inbox",
      batchId: batch.id,
    });
    if (projection.kind !== "candidate-inbox")
      throw new Error("Unexpected projection");

    expect(() =>
      parseCandidateReview(projection.markdown, batch, {
        actor: { id: "curator", kind: "human" },
        decidedAt: now,
      }),
    ).toThrow(/exactly one checked decision/);

    const ambiguous = projection.markdown
      .replace("- [ ] Summarize", "- [x] Summarize")
      .replace("- [ ] Dismiss", "- [x] Dismiss");
    expect(() =>
      parseCandidateReview(ambiguous, batch, {
        actor: { id: "curator", kind: "human" },
        decidedAt: now,
      }),
    ).toThrow(/exactly one checked decision/);
  });

  it("applies source overlap and resurfaces an expired deferred paper", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "deepgeno-defer-"));
    roots.push(root);
    const store = new GitFileStateStore(root);
    const requests: Array<{ from: string; to: string }> = [];
    const source: LiteratureSource = {
      name: "fixture-overlap",
      source: "biorxiv",
      overlapDays: 3,
      async fetch(request) {
        requests.push({ from: request.from, to: request.to });
        return {
          records:
            request.to === "2026-08-20"
              ? [sourceRecord({ publishedAt: "2026-08-20" })]
              : [],
        };
      },
    };
    let current = "2026-08-20T07:00:00.000Z";
    const lifecycle = createLiteratureLifecycle({
      store,
      sources: [source],
      clock: () => new Date(current),
      relevanceThreshold: 0.2,
    });

    const initial = await lifecycle.run({
      kind: "discover",
      from: "2026-08-20",
      to: "2026-08-20",
      trigger: "test",
    });
    if (initial.command !== "discover") throw new Error("Unexpected report");
    expect(requests[0]).toEqual({ from: "2026-08-17", to: "2026-08-20" });
    expect((await store.listCheckpoints())[0]).toMatchObject({
      window: { from: "2026-08-17", through: "2026-08-20" },
      replayOverlapDays: 3,
    });

    const firstBatch = await store.loadCandidateBatch(initial.batchId);
    const review = await lifecycle.project({
      kind: "candidate-inbox",
      batchId: firstBatch.id,
    });
    if (review.kind !== "candidate-inbox")
      throw new Error("Unexpected projection");
    const deferred = parseCandidateReview(
      review.markdown.replace("- [ ] Defer 7 days", "- [x] Defer 7 days"),
      firstBatch,
      { actor: { id: "curator", kind: "human" }, decidedAt: current },
    );
    await lifecycle.applyDecisions(deferred);

    current = "2026-08-28T07:00:00.000Z";
    const resurfaced = await lifecycle.run({
      kind: "discover",
      from: "2026-08-28",
      to: "2026-08-28",
      trigger: "test",
    });
    if (resurfaced.command !== "discover") throw new Error("Unexpected report");
    expect(requests.at(-1)).toEqual({ from: "2026-08-25", to: "2026-08-28" });
    const secondBatch = await store.loadCandidateBatch(resurfaced.batchId);
    expect(secondBatch.candidates).toHaveLength(1);
    expect(secondBatch.candidates[0]).toMatchObject({
      id: firstBatch.candidates[0]!.id,
      revision: 2,
      status: "awaiting-triage",
    });
  });
});

async function selectedLifecycle(model: FakeStructuredModel): Promise<{
  lifecycle: LiteratureLifecycle;
  store: GitFileStateStore;
  paperId: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "deepgeno-synthesis-"));
  roots.push(root);
  const store = new GitFileStateStore(root);
  const lifecycle = createLiteratureLifecycle({
    store,
    sources: [new FixtureSource([sourceRecord({})])],
    model,
    clock: () => new Date(now),
    relevanceThreshold: 0.2,
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
    { actor: { id: "curator", kind: "human" }, decidedAt: now },
  );
  await lifecycle.applyDecisions(decision);
  return { lifecycle, store, paperId: batch.candidates[0]!.paper.id };
}

async function synthesizeSelected(
  lifecycle: LiteratureLifecycle,
  paperId: string,
  revisionOfDraftId?: string,
): Promise<
  Extract<RunReport, { command: "synthesize"; outcome: "completed" }>
> {
  const prepared = await lifecycle.run({
    kind: "prepare-synthesis",
    paperId,
    ...(revisionOfDraftId ? { revisionOfDraftId } : {}),
  });
  if (
    prepared.command !== "prepare-synthesis" ||
    prepared.requestState !== "prepared"
  )
    throw new Error("Expected a newly prepared synthesis request");
  const armed = await lifecycle.run({
    kind: "arm-synthesis",
    requestId: prepared.requestId,
  });
  if (armed.command !== "arm-synthesis")
    throw new Error("Expected an armed synthesis request");
  const completed = await lifecycle.run({
    kind: "synthesize",
    requestId: prepared.requestId,
    executionToken: armed.executionToken,
  });
  if (completed.command !== "synthesize" || completed.outcome !== "completed")
    throw new Error("Expected a completed synthesis request");
  return completed;
}

function sourceRecord(overrides: Partial<SourceDocument>): SourceDocument {
  return {
    source: "biorxiv",
    sourceId: "10.1101/2026.08.28.123456",
    title:
      "DNA language model maps genomic regulatory sequence to enhancer function",
    authors: ["Ada Genome", "Lin Sequence"],
    abstract:
      "We introduce a DNA language model transformer for sequence-to-function prediction across human regulatory genomics. The foundation model uses masked nucleotide prediction on genomic sequence, then evaluates enhancer activity, gene expression, and noncoding variant effects. Across multiple held-out cell types, the model improves AUROC while exposing learned representations of promoter and enhancer grammar. This complete abstract is intentionally long enough for deterministic candidate validation.",
    publishedAt: "2026-08-28",
    url: "https://doi.org/10.1101/2026.08.28.123456",
    pdfUrl:
      "https://www.biorxiv.org/content/10.1101/2026.08.28.123456.full.pdf",
    doi: "10.1101/2026.08.28.123456",
    categories: ["bioinformatics"],
    ...overrides,
  };
}

function summaryFixture(
  scope: TechnicalSummary["evidenceScope"],
): TechnicalSummary {
  const statement = {
    statement: "The work predicts regulatory function from DNA.",
    evidenceIds: ["E0001"],
  };
  return {
    schemaVersion: "1.0",
    hook: "A DNA transformer links regulatory sequence to measured enhancer activity.",
    coreProblem: statement,
    novelty: [
      {
        statement: "It unifies pretraining and enhancer prediction.",
        evidenceIds: ["E0001"],
      },
    ],
    architecture: {
      overview: "A transformer encoder trained on nucleotide sequence.",
      modelFamily: "transformer",
      parameterScale: null,
      representation: "nucleotide tokens",
      tokenization: null,
      contextLength: null,
      trainingObjectives: ["masked nucleotide prediction"],
      evidenceIds: ["E0001"],
    },
    data: {
      datasets: [
        {
          name: "human genome",
          role: "pretraining",
          scale: null,
          organisms: ["human"],
          evidenceIds: ["E0001"],
        },
      ],
      benchmarks: [],
    },
    quantitativeResults: [
      {
        claim: "The model improves AUROC on held-out enhancer prediction.",
        metric: "AUROC",
        value: null,
        baseline: null,
        delta: null,
        benchmark: "enhancer activity",
        evidenceIds: ["E0001"],
      },
    ],
    takeaways: [statement],
    limitations: [
      {
        statement: "Parameter scale is not reported in the evidence.",
        evidenceIds: ["E0001"],
      },
    ],
    topics: ["dna-language-model", "sequence-to-function"],
    tags: ["transformer", "regulatory-genomics"],
    organisms: ["human"],
    modalities: ["DNA"],
    links: { code: null, data: null, project: null },
    evidenceScope: scope,
  };
}

const failingSource: LiteratureSource = {
  name: "fixture-failure",
  source: "crossref",
  async fetch() {
    throw Object.assign(new Error("fixture unavailable"), {
      code: "source_unavailable",
    });
  },
};

const openTextEnricher: MetadataEnricher = {
  name: "fixture-open-text",
  async enrich() {
    return {
      fullText: {
        format: "jats" as const,
        content:
          "<article><body><sec><title>Results</title><p>The transformer improves enhancer prediction across held-out human cell types with evidence grounded evaluation.</p></sec></body></article>",
        license: "CC-BY-4.0",
        sourceUrl:
          "https://www.ebi.ac.uk/europepmc/webservices/rest/PMC1/fullTextXML",
      },
    };
  },
};

const failingEnricher: MetadataEnricher = {
  name: "fixture-failing-enricher",
  async enrich() {
    throw new Error("fixture enrichment unavailable");
  },
};

class FaultInjectingStore extends GitFileStateStore {
  failReleaseOnce = false;
  failDeliveryOnce = false;

  override async saveRelease(
    release: PrivateRelease,
    publication: PublishedPaper,
  ): Promise<string> {
    if (this.failReleaseOnce) {
      this.failReleaseOnce = false;
      throw Object.assign(new Error("release fault"), {
        code: "fault_release",
      });
    }
    return super.saveRelease(release, publication);
  }

  override async saveDelivery(delivery: Delivery): Promise<string> {
    if (this.failDeliveryOnce) {
      this.failDeliveryOnce = false;
      throw Object.assign(new Error("delivery fault"), {
        code: "fault_delivery",
      });
    }
    return super.saveDelivery(delivery);
  }
}
