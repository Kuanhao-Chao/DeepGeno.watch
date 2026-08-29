import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { TechnicalSummary } from "@deepgeno/contracts";
import { createLiteratureLifecycle } from "./lifecycle.js";
import { FakeStructuredModel } from "./models/fake.js";
import type {
  LiteratureSource,
  MetadataEnricher,
  SourceDocument,
} from "./ports.js";
import { parseCandidateReview, parseDraftReview } from "./review.js";
import { FixtureSource } from "./sources/fixture.js";
import { GitFileStateStore } from "./store.js";

const roots: string[] = [];
const now = "2026-08-28T07:00:00.000Z";

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("LiteratureLifecycle", () => {
  it("enforces both human gates and publishes one deduplicated evidence-backed paper", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "deepgeno-lifecycle-"));
    roots.push(root);
    const store = new GitFileStateStore(root);
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
      lifecycle.run({ kind: "synthesize", paperId }),
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

    const synthesis = await lifecycle.run({ kind: "synthesize", paperId });
    if (synthesis.command !== "synthesize")
      throw new Error("Unexpected report");
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

    const revision = await lifecycle.run({
      kind: "synthesize",
      paperId,
      revisionOfDraftId: draft.id,
    });
    if (revision.command !== "synthesize") throw new Error("Unexpected report");
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

    const publication = await lifecycle.run({
      kind: "publish",
      draftId: revisedDraft.id,
    });
    if (publication.command !== "publish") throw new Error("Unexpected report");
    expect(publication.publicPath).toMatch(/^content\/public\/papers\/.+\.md$/);
    const publicMarkdown = await readFile(
      path.join(root, publication.publicPath),
      "utf8",
    );
    expect(publicMarkdown).toContain("priority: must-read");
    expect(publicMarkdown).not.toContain(primary.abstract);

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

    const replay = await lifecycle.run({ kind: "synthesize", paperId });
    expect(replay).toMatchObject({ command: "synthesize", changedPaths: [] });
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
