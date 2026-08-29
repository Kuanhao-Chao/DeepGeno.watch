import {
  CandidateBatchSchema,
  DecisionBatchSchema,
  DraftDecisionBatchSchema,
  DraftSummarySchema,
  type CandidateBatch,
  type DecisionBatch,
  type DraftDecision,
  type DraftDecisionBatch,
  type DraftSummary,
  type Checkpoint,
} from "@deepgeno/contracts";
import { LiteratureError, invariant } from "./errors.js";
import { assembleEvidence } from "./evidence.js";
import { toCandidate, toPaper } from "./contracts.js";
import { normalizeAndRank, type RelevancePolicy } from "./processing.js";
import type {
  LiteratureSource,
  MetadataEnricher,
  SourceFetchResult,
  StructuredModel,
} from "./ports.js";
import { generateTechnicalSummary, SUMMARY_PROMPT } from "./prompt.js";
import {
  buildPublication,
  PublicDeclassifier,
  toPublicFrontmatter,
} from "./publication.js";
import { createPendingDelivery, sealPublicProjection } from "./release.js";
import { renderCandidateReview, renderDraftReview } from "./review.js";
import { GitFileStateStore, type StoredPaper } from "./store.js";
import { sha256, stableJson } from "./util.js";

export type DiscoverCommand = {
  kind: "discover";
  from: string;
  to: string;
  trigger?: "schedule" | "manual" | "replay" | "test";
};
export type SynthesizeCommand = {
  kind: "synthesize";
  paperId: string;
  revisionOfDraftId?: string;
};
export type PublishCommand = { kind: "publish"; draftId: string };
export type LiteratureCommand =
  DiscoverCommand | SynthesizeCommand | PublishCommand;

export type RunReport =
  | {
      command: "discover";
      batchId: string;
      batchRevision: number;
      candidateCount: number;
      reviewPath: string;
      changedPaths: string[];
      sourceIssues: Array<{ source: string; code: string; message: string }>;
    }
  | {
      command: "synthesize";
      draftId: string;
      paperId: string;
      slug: string;
      reviewPath: string;
      changedPaths: string[];
    }
  | {
      command: "publish";
      draftId: string;
      paperId: string;
      slug: string;
      privatePublicationPath: string;
      releasePath: string;
      deliveryPath: string;
      publicDigest: string;
      changedPaths: string[];
    };

export type DecisionReport =
  | {
      kind: "triage";
      decisionBatchId: string;
      selectedPaperIds: string[];
      deferredPaperIds: string[];
      dismissedPaperIds: string[];
      changedPaths: string[];
    }
  | {
      kind: "draft-review";
      draftDecisionBatchId: string;
      approvedDraftIds: string[];
      revisedDraftIds: string[];
      dismissedDraftIds: string[];
      changedPaths: string[];
    };

export type ProjectionRequest =
  | { kind: "candidate-inbox"; batchId: string }
  | { kind: "draft-inbox"; draftId: string }
  | { kind: "public-catalog" };

export type Projection =
  | { kind: "candidate-inbox"; markdown: string }
  | { kind: "draft-inbox"; markdown: string }
  | {
      kind: "public-catalog";
      papers: ReturnType<typeof toPublicFrontmatter>[];
    };

export interface LiteratureLifecycle {
  run(command: LiteratureCommand): Promise<RunReport>;
  applyDecisions(
    batch: DecisionBatch | DraftDecisionBatch,
  ): Promise<DecisionReport>;
  project(view: ProjectionRequest): Promise<Projection>;
}

export interface LiteratureLifecycleOptions {
  store: GitFileStateStore;
  sources: readonly LiteratureSource[];
  enrichers?: readonly MetadataEnricher[];
  model?: StructuredModel;
  clock?: () => Date;
  relevanceThreshold?: number;
  relevancePolicy?: RelevancePolicy;
}

export function createLiteratureLifecycle(
  options: LiteratureLifecycleOptions,
): LiteratureLifecycle {
  return new DefaultLiteratureLifecycle(options);
}

class DefaultLiteratureLifecycle implements LiteratureLifecycle {
  readonly #store: GitFileStateStore;
  readonly #sources: readonly LiteratureSource[];
  readonly #enrichers: readonly MetadataEnricher[];
  readonly #model: StructuredModel | undefined;
  readonly #clock: () => Date;
  readonly #threshold: number;
  readonly #relevancePolicy: RelevancePolicy;

  constructor(options: LiteratureLifecycleOptions) {
    invariant(
      options.sources.length > 0,
      "source_required",
      "At least one literature source is required",
    );
    this.#store = options.store;
    this.#sources = options.sources;
    this.#enrichers = options.enrichers ?? [];
    this.#model = options.model;
    this.#clock = options.clock ?? (() => new Date());
    this.#threshold = options.relevanceThreshold ?? 0.38;
    this.#relevancePolicy = options.relevancePolicy ?? {};
  }

  async run(command: LiteratureCommand): Promise<RunReport> {
    if (command.kind === "discover") return this.#discover(command);
    if (command.kind === "synthesize") return this.#synthesize(command);
    return this.#publish(command);
  }

  async applyDecisions(
    batch: DecisionBatch | DraftDecisionBatch,
  ): Promise<DecisionReport> {
    if ("candidateBatchId" in batch)
      return this.#applyCandidateDecisions(DecisionBatchSchema.parse(batch));
    return this.#applyDraftDecisions(DraftDecisionBatchSchema.parse(batch));
  }

  async project(view: ProjectionRequest): Promise<Projection> {
    if (view.kind === "candidate-inbox") {
      return {
        kind: view.kind,
        markdown: renderCandidateReview(
          await this.#store.loadCandidateBatch(view.batchId),
        ),
      };
    }
    if (view.kind === "draft-inbox") {
      const draft = await this.#store.loadDraft(view.draftId);
      const stored = await this.#store.loadPaper(draft.paperId);
      return {
        kind: view.kind,
        markdown: renderDraftReview(draft, stored.paper.title),
      };
    }
    const publications = await this.#store.listPublications();
    const papers = await Promise.all(
      publications.map(async (publication) =>
        toPublicFrontmatter(
          publication,
          await this.#store.loadDraft(publication.review.draftId),
        ),
      ),
    );
    return {
      kind: view.kind,
      papers: papers.sort((left, right) =>
        right.publishedAt.localeCompare(left.publishedAt),
      ),
    };
  }

  async #discover(
    command: DiscoverCommand,
  ): Promise<Extract<RunReport, { command: "discover" }>> {
    invariant(
      /^\d{4}-\d{2}-\d{2}$/.test(command.from),
      "invalid_date",
      "Discovery --from must be YYYY-MM-DD",
    );
    invariant(
      /^\d{4}-\d{2}-\d{2}$/.test(command.to),
      "invalid_date",
      "Discovery --to must be YYYY-MM-DD",
    );
    invariant(
      command.from <= command.to,
      "invalid_window",
      "Discovery window is inverted",
    );
    const now = this.#clock().toISOString();
    const runId = `run-${command.from.replaceAll("-", "")}-${command.to.replaceAll("-", "")}-${sha256(
      this.#sources
        .map((source) => source.name)
        .sort()
        .join("\n"),
    ).slice(0, 10)}`;
    const settled = await Promise.allSettled(
      this.#sources.map((source) =>
        this.#fetchSource(source, command, runId, now),
      ),
    );
    const sourceIssues: Array<{
      source: string;
      code: string;
      message: string;
    }> = [];
    const sourceResults: SourceFetchResult[] = [];
    const changedPaths: string[] = [];
    settled.forEach((result, index) => {
      const source = this.#sources[index]!;
      if (result.status === "rejected") {
        sourceIssues.push({
          source: source.name,
          code:
            result.reason instanceof LiteratureError
              ? result.reason.code
              : "source_unavailable",
          message:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        });
        return;
      }
      sourceResults.push(result.value.result);
      changedPaths.push(this.#store.relative(result.value.checkpointPath));
      if (result.value.result.cursor) {
        sourceIssues.push({
          source: source.name,
          code: "source_incomplete",
          message:
            "Source pagination reached the configured page budget; the cursor will resume on replay.",
        });
      }
    });
    invariant(
      sourceResults.length > 0,
      "all_sources_unavailable",
      "Every configured literature source failed",
    );
    const normalized = normalizeAndRank(
      sourceResults.flatMap((result) => result.records),
      new Map(),
      this.#relevancePolicy,
    );
    const existing = await this.#store.listPapers();
    const existingById = new Map(
      existing.map((entry) => [entry.paper.id, entry]),
    );
    const candidateDecisions = (
      await this.#store.listCandidateDecisions()
    ).flatMap((batch) => batch.decisions);
    const batchId = `candidate-inbox-${command.to}`;
    const priorBatch = (await this.#store.listCandidateBatches()).find(
      (batch) => batch.id === batchId,
    );
    const candidates =
      priorBatch?.candidates.filter(
        (candidate) =>
          !candidateDecisions.some(
            (decision) =>
              decision.candidateId === candidate.id &&
              decision.candidateRevision === candidate.revision,
          ),
      ) ?? [];
    const candidateIds = new Set(candidates.map((candidate) => candidate.id));

    // A deferred paper must re-enter triage when its timer expires even if the
    // upstream source does not emit the old record in today's date window.
    for (const previous of existing) {
      const priorDecision = candidateDecisions.find(
        (decision) =>
          decision.candidateId === previous.candidate.id &&
          decision.candidateRevision === previous.candidate.revision,
      );
      if (
        priorDecision?.action !== "defer" ||
        !priorDecision.deferUntil ||
        priorDecision.deferUntil > now ||
        candidateIds.has(previous.candidate.id)
      ) {
        continue;
      }
      const { recordSha256: _priorHash, ...priorCore } = previous.candidate;
      const candidateCore = {
        ...priorCore,
        revision: previous.candidate.revision + 1,
        discoveredAt: now,
        discoveryRunId: runId,
        status: "awaiting-triage" as const,
      };
      const candidate = CandidateBatchSchema.shape.candidates.element.parse({
        ...candidateCore,
        recordSha256: sha256(stableJson(candidateCore)),
      });
      const requeued = { ...previous, candidate };
      changedPaths.push(
        ...(await this.#store.savePaper(requeued)).map((target) =>
          this.#store.relative(target),
        ),
      );
      existingById.set(previous.paper.id, requeued);
      candidates.push(candidate);
      candidateIds.add(candidate.id);
    }

    for (const item of normalized) {
      if (!item.tags.length || Math.min(1, item.score / 20) < this.#threshold)
        continue;
      const previous = existingById.get(item.id);
      const priorDecision = previous
        ? candidateDecisions
            .filter(
              (decision) =>
                decision.candidateId === previous.candidate.id &&
                decision.candidateRevision === previous.candidate.revision,
            )
            .at(-1)
        : undefined;
      if (
        priorDecision?.action === "summarize" ||
        priorDecision?.action === "dismiss"
      )
        continue;
      if (
        priorDecision?.action === "defer" &&
        priorDecision.deferUntil &&
        priorDecision.deferUntil > now
      )
        continue;
      if (previous && !priorDecision) continue;
      const paper = toPaper(item, now);
      if (previous) {
        paper.firstSeenAt = previous.paper.firstSeenAt;
        paper.lastSeenAt = now;
      }
      const revision = previous ? previous.candidate.revision + 1 : 1;
      const candidate = toCandidate(item, paper, runId, now, revision);
      const stored: StoredPaper = {
        paper,
        candidate,
        sourceDocuments: item.sourceRecords,
        enrichment: item.enrichment,
      };
      changedPaths.push(
        ...(await this.#store.savePaper(stored)).map((target) =>
          this.#store.relative(target),
        ),
      );
      candidates.push(candidate);
      candidateIds.add(candidate.id);
    }
    candidates.sort(
      (left, right) =>
        right.relevance.score - left.relevance.score ||
        (right.paper.publicationDate ?? "").localeCompare(
          left.paper.publicationDate ?? "",
        ) ||
        left.id.localeCompare(right.id),
    );
    const recordIdentity = candidates.map(
      (candidate) => candidate.recordSha256,
    );
    if (
      priorBatch &&
      stableJson(
        priorBatch.candidates.map((candidate) => candidate.recordSha256),
      ) === stableJson(recordIdentity)
    ) {
      const reviewPath = await this.#store.writeReview(
        batchId,
        renderCandidateReview(priorBatch),
      );
      return {
        command: "discover",
        batchId,
        batchRevision: priorBatch.revision,
        candidateCount: priorBatch.candidates.length,
        reviewPath: this.#store.relative(reviewPath),
        changedPaths: [...new Set(changedPaths)].sort(),
        sourceIssues,
      };
    }
    const core = {
      schemaVersion: "1.0" as const,
      id: batchId,
      revision: (priorBatch?.revision ?? 0) + 1,
      window: { from: command.from, through: command.to },
      generatedAt: now,
      candidates,
      run: {
        runId,
        trigger: command.trigger ?? "manual",
        startedAt: now,
        completedAt: now,
      },
    };
    const batch = CandidateBatchSchema.parse({
      ...core,
      recordSha256: sha256(stableJson(core)),
    });
    const batchPath = await this.#store.saveCandidateBatch(batch);
    const reviewPath = await this.#store.writeReview(
      batchId,
      renderCandidateReview(batch),
    );
    changedPaths.push(
      this.#store.relative(batchPath),
      this.#store.relative(reviewPath),
    );
    return {
      command: "discover",
      batchId,
      batchRevision: batch.revision,
      candidateCount: candidates.length,
      reviewPath: this.#store.relative(reviewPath),
      changedPaths: [...new Set(changedPaths)].sort(),
      sourceIssues,
    };
  }

  async #fetchSource(
    source: LiteratureSource,
    command: DiscoverCommand,
    runId: string,
    now: string,
  ): Promise<{
    result: Awaited<ReturnType<LiteratureSource["fetch"]>>;
    checkpointPath: string;
  }> {
    const prior = await this.#store.loadCheckpoint(source.name);
    const records = [];
    const window = {
      from: shiftIsoDate(command.from, -(source.overlapDays ?? 0)),
      through: command.to,
    };

    if (prior?.cursor) {
      const resumed = await source.fetch({
        from: prior.window.from,
        to: prior.window.through,
        cursor: prior.cursor,
      });
      records.push(...resumed.records);
      if (resumed.cursor) {
        const checkpointPath = await this.#store.saveCheckpoint(
          checkpointFor(
            source,
            prior.window,
            resumed.cursor,
            runId,
            now,
            prior,
          ),
        );
        return { result: { records, cursor: resumed.cursor }, checkpointPath };
      }
      if (
        prior.window.from === window.from &&
        prior.window.through === window.through
      ) {
        const checkpointPath = await this.#store.saveCheckpoint(
          checkpointFor(source, prior.window, undefined, runId, now, prior),
        );
        return { result: { records }, checkpointPath };
      }
    }

    const current = await source.fetch({
      from: window.from,
      to: window.through,
    });
    records.push(...current.records);
    const checkpointPath = await this.#store.saveCheckpoint(
      checkpointFor(source, window, current.cursor, runId, now, prior),
    );
    return {
      result: {
        records,
        ...(current.cursor ? { cursor: current.cursor } : {}),
      },
      checkpointPath,
    };
  }

  async #applyCandidateDecisions(
    batch: DecisionBatch,
  ): Promise<Extract<DecisionReport, { kind: "triage" }>> {
    const candidateBatch = await this.#store.loadCandidateBatch(
      batch.candidateBatchId,
    );
    invariant(
      candidateBatch.revision === batch.candidateBatchRevision,
      "decision_stale_batch",
      "Decision batch targets a stale candidate batch",
    );
    const expected = new Map(
      candidateBatch.candidates.map((candidate) => [candidate.id, candidate]),
    );
    invariant(
      batch.decisions.length === expected.size,
      "decision_incomplete",
      "Every candidate must have exactly one decision",
    );
    const prior = (await this.#store.listCandidateDecisions()).flatMap(
      (value) => value.decisions,
    );
    for (const decision of batch.decisions) {
      const candidate = expected.get(decision.candidateId);
      invariant(
        candidate,
        "decision_unknown_candidate",
        `Unknown candidate: ${decision.candidateId}`,
      );
      invariant(
        candidate.revision === decision.candidateRevision,
        "decision_stale_candidate",
        `Stale candidate revision: ${decision.candidateId}`,
      );
      const conflict = prior.find(
        (entry) =>
          entry.candidateId === decision.candidateId &&
          entry.candidateRevision === decision.candidateRevision,
      );
      invariant(
        !conflict || stableJson(conflict) === stableJson(decision),
        "decision_conflict",
        `Candidate revision already has a different decision: ${decision.candidateId}`,
      );
    }
    const target = await this.#store.saveCandidateDecisions(batch);
    const mapPaperIds = (action: "summarize" | "defer" | "dismiss") =>
      batch.decisions
        .filter((decision) => decision.action === action)
        .map((decision) => expected.get(decision.candidateId)!.paper.id);
    return {
      kind: "triage",
      decisionBatchId: batch.id,
      selectedPaperIds: mapPaperIds("summarize"),
      deferredPaperIds: mapPaperIds("defer"),
      dismissedPaperIds: mapPaperIds("dismiss"),
      changedPaths: [this.#store.relative(target)],
    };
  }

  async #applyDraftDecisions(
    batch: DraftDecisionBatch,
  ): Promise<Extract<DecisionReport, { kind: "draft-review" }>> {
    const prior = (await this.#store.listDraftDecisions()).flatMap(
      (value) => value.decisions,
    );
    for (const decision of batch.decisions) {
      const draft = await this.#store.loadDraft(decision.draftId);
      invariant(
        draft.revision === decision.draftRevision,
        "decision_stale_draft",
        `Stale draft revision: ${decision.draftId}`,
      );
      const conflict = prior.find(
        (entry) =>
          entry.draftId === decision.draftId &&
          entry.draftRevision === decision.draftRevision,
      );
      invariant(
        !conflict || stableJson(conflict) === stableJson(decision),
        "decision_conflict",
        `Draft revision already has a different decision: ${decision.draftId}`,
      );
    }
    const target = await this.#store.saveDraftDecisions(batch);
    return {
      kind: "draft-review",
      draftDecisionBatchId: batch.id,
      approvedDraftIds: batch.decisions
        .filter((decision) => decision.action === "approve")
        .map((decision) => decision.draftId),
      revisedDraftIds: batch.decisions
        .filter((decision) => decision.action === "revise")
        .map((decision) => decision.draftId),
      dismissedDraftIds: batch.decisions
        .filter((decision) => decision.action === "dismiss")
        .map((decision) => decision.draftId),
      changedPaths: [this.#store.relative(target)],
    };
  }

  async #synthesize(
    command: SynthesizeCommand,
  ): Promise<Extract<RunReport, { command: "synthesize" }>> {
    invariant(
      this.#model,
      "model_required",
      "Synthesis requires an explicitly configured model provider and model",
    );
    const stored = await this.#store.loadPaper(command.paperId);
    const decisions = (await this.#store.listCandidateDecisions()).flatMap(
      (batch) => batch.decisions,
    );
    const selection = decisions.find(
      (decision) =>
        decision.candidateId === stored.candidate.id &&
        decision.candidateRevision === stored.candidate.revision &&
        decision.action === "summarize",
    );
    invariant(
      selection,
      "synthesis_not_selected",
      `Paper has not passed candidate triage: ${command.paperId}`,
    );

    const drafts = await this.#store.listDrafts();
    const revisionOf = command.revisionOfDraftId
      ? await this.#store.loadDraft(command.revisionOfDraftId)
      : undefined;
    if (revisionOf) {
      invariant(
        revisionOf.paperId === stored.paper.id &&
          revisionOf.candidateId === stored.candidate.id &&
          revisionOf.candidateRevision === stored.candidate.revision,
        "revision_draft_mismatch",
        `Draft does not belong to the selected paper revision: ${revisionOf.id}`,
      );
    }
    const revisionDecision = revisionOf
      ? (await this.#store.listDraftDecisions())
          .flatMap((batch) => batch.decisions)
          .find(
            (decision): decision is DraftDecision & { action: "revise" } =>
              decision.draftId === revisionOf.id &&
              decision.draftRevision === revisionOf.revision &&
              decision.action === "revise",
          )
      : undefined;
    if (revisionOf) {
      invariant(
        revisionDecision,
        "revision_not_requested",
        `Draft has no recorded revision request: ${revisionOf.id}`,
      );
    }
    const existing = revisionOf
      ? drafts.find(
          (draft) =>
            draft.supersedesDraftId === revisionOf.id &&
            draft.revision === revisionOf.revision + 1,
        )
      : drafts.find(
          (draft) =>
            draft.candidateId === stored.candidate.id &&
            draft.candidateRevision === stored.candidate.revision &&
            draft.revision === 1,
        );
    if (existing) {
      const reviewPath = await this.#store.writeReview(
        existing.id,
        renderDraftReview(existing, stored.paper.title),
      );
      return {
        command: "synthesize",
        draftId: existing.id,
        paperId: stored.paper.id,
        slug: publicationSlug(stored.paper.title, stored.paper.id),
        reviewPath: this.#store.relative(reviewPath),
        changedPaths: [],
      };
    }

    const now = this.#clock().toISOString();
    const changedPaths: string[] = [];
    let evidence;
    if (revisionOf) {
      evidence = revisionOf.evidence;
    } else {
      const representative =
        stored.sourceDocuments.find((record) => record.doi) ??
        stored.sourceDocuments[0];
      invariant(
        representative,
        "source_record_missing",
        `Paper has no source record: ${stored.paper.id}`,
      );
      const enrichmentResults = await Promise.allSettled(
        this.#enrichers.map((enricher) => enricher.enrich(representative)),
      );
      const enrichmentWarnings: string[] = [];
      const enrichments = enrichmentResults.flatMap((result, index) => {
        if (result.status === "fulfilled")
          return result.value ? [result.value] : [];
        enrichmentWarnings.push(
          `${this.#enrichers[index]!.name} enrichment was unavailable; synthesis continued with remaining evidence.`,
        );
        return [];
      });
      stored.enrichment = mergeEnrichments([stored.enrichment, ...enrichments]);
      evidence = assembleEvidence(
        stored.paper,
        stored.enrichment,
        now,
        enrichmentWarnings,
      );
      // Keep selected evidence excerpts and digests in the draft, but do not
      // turn Git into a mirror of an entire OA JATS document.
      const persistedEnrichment = { ...stored.enrichment };
      delete persistedEnrichment.fullText;
      changedPaths.push(
        ...(
          await this.#store.savePaper({
            ...stored,
            enrichment: persistedEnrichment,
          })
        ).map((target) => this.#store.relative(target)),
      );
    }
    const generated = await generateTechnicalSummary(
      this.#model,
      stored.paper,
      evidence,
      {
        ...(revisionDecision
          ? { revisionFeedback: revisionDecision.note }
          : {}),
      },
    );
    const provider =
      this.#model.provider === "fake" ? "openai" : this.#model.provider;
    const draftRevision = revisionOf ? revisionOf.revision + 1 : 1;
    const baseDraftId = `draft-${stored.paper.id}-r${stored.candidate.revision}`;
    const draftCore = {
      schemaVersion: "1.0" as const,
      id: revisionOf ? `${baseDraftId}-v${draftRevision}` : baseDraftId,
      revision: draftRevision,
      ...(revisionOf ? { supersedesDraftId: revisionOf.id } : {}),
      candidateId: stored.candidate.id,
      candidateRevision: stored.candidate.revision,
      paperId: stored.paper.id,
      summary: generated.summary,
      evidence,
      generation: {
        provider,
        model: this.#model.model,
        generatedAt: now,
        prompt: { ...SUMMARY_PROMPT, sha256: generated.promptSha256 },
        outputSchemaVersion: "1.0" as const,
        inputSha256: evidence.inputSha256,
        ...(generated.responseId ? { requestId: generated.responseId } : {}),
        ...(generated.usage ? { usage: generated.usage } : {}),
      },
    };
    const draft = DraftSummarySchema.parse({
      ...draftCore,
      recordSha256: sha256(stableJson(draftCore)),
    });
    const draftPath = await this.#store.saveDraft(draft);
    const reviewPath = await this.#store.writeReview(
      draft.id,
      renderDraftReview(draft, stored.paper.title),
    );
    changedPaths.push(
      this.#store.relative(draftPath),
      this.#store.relative(reviewPath),
    );
    return {
      command: "synthesize",
      draftId: draft.id,
      paperId: stored.paper.id,
      slug: publicationSlug(stored.paper.title, stored.paper.id),
      reviewPath: this.#store.relative(reviewPath),
      changedPaths: [...new Set(changedPaths)].sort(),
    };
  }

  async #publish(
    command: PublishCommand,
  ): Promise<Extract<RunReport, { command: "publish" }>> {
    const draft = await this.#store.loadDraft(command.draftId);
    const stored = await this.#store.loadPaper(draft.paperId);
    const decisions = (await this.#store.listDraftDecisions()).flatMap(
      (batch) => batch.decisions,
    );
    const approval = decisions.find(
      (decision): decision is DraftDecision & { action: "approve" } =>
        decision.draftId === draft.id &&
        decision.draftRevision === draft.revision &&
        decision.action === "approve",
    );
    invariant(
      approval,
      "publication_not_approved",
      `Draft has not passed publication review: ${draft.id}`,
    );
    let publication = await this.#store.findPublicationByPaperId(
      stored.paper.id,
    );
    if (publication) {
      invariant(
        publication.review.draftId === draft.id,
        "publication_draft_mismatch",
        `Publication already belongs to a different approved draft: ${publication.slug}`,
      );
      let release = await this.#store.loadReleaseForPublication(
        publication.slug,
        publication,
      );
      if (release) {
        const existingDelivery =
          await this.#store.loadDeliveryForRelease(release);
        const delivery =
          existingDelivery ??
          createPendingDelivery(release, this.#clock().toISOString());
        const deliveryPath = existingDelivery
          ? this.#store.deliveryPath(delivery)
          : await this.#store.saveDelivery(delivery);
        return {
          command: "publish",
          draftId: draft.id,
          paperId: stored.paper.id,
          slug: publication.slug,
          privatePublicationPath: this.#store.relative(
            this.#store.publicationPath(publication.slug),
          ),
          releasePath: this.#store.relative(this.#store.releasePath(release)),
          deliveryPath: this.#store.relative(deliveryPath),
          publicDigest: release.projection.sha256,
          changedPaths: existingDelivery
            ? []
            : [this.#store.relative(deliveryPath)],
        };
      }
      const expectedPublication = buildPublication(
        stored.paper,
        draft,
        approval,
        {
          publishedAt: publication.publishedAt,
          ...(await this.#store.loadDraftReviewContext(draft.id)),
        },
      );
      invariant(
        stableJson(publication) === stableJson(expectedPublication),
        "publication_integrity_mismatch",
        `Immutable publication does not match approved draft: ${publication.slug}`,
      );
      let createdRelease = false;
      {
        const projection = new PublicDeclassifier().declassify(
          publication,
          draft,
        );
        release = sealPublicProjection(projection, {
          draftId: draft.id,
          publicationPath: this.#store.relative(
            this.#store.publicationPath(publication.slug),
          ),
          publicationSha256: sha256(stableJson(publication)),
          createdAt: publication.publishedAt,
        });
        await this.#store.saveRelease(release, publication);
        createdRelease = true;
      }
      const existingDelivery =
        await this.#store.loadDeliveryForRelease(release);
      const delivery =
        existingDelivery ??
        createPendingDelivery(release, this.#clock().toISOString());
      const deliveryPath = existingDelivery
        ? this.#store.deliveryPath(delivery)
        : await this.#store.saveDelivery(delivery);
      return {
        command: "publish",
        draftId: draft.id,
        paperId: stored.paper.id,
        slug: publication.slug,
        privatePublicationPath: this.#store.relative(
          this.#store.publicationPath(publication.slug),
        ),
        releasePath: this.#store.relative(this.#store.releasePath(release)),
        deliveryPath: this.#store.relative(deliveryPath),
        publicDigest: release.projection.sha256,
        changedPaths: [
          ...(createdRelease
            ? [this.#store.relative(this.#store.releasePath(release))]
            : []),
          ...(existingDelivery ? [] : [this.#store.relative(deliveryPath)]),
        ].sort(),
      };
    }
    publication = buildPublication(stored.paper, draft, approval, {
      publishedAt: this.#clock().toISOString(),
      ...(await this.#store.loadDraftReviewContext(draft.id)),
    });
    const recordPath = await this.#store.savePublication(publication);
    const projection = new PublicDeclassifier().declassify(publication, draft);
    const release = sealPublicProjection(projection, {
      draftId: draft.id,
      publicationPath: this.#store.relative(recordPath),
      publicationSha256: sha256(stableJson(publication)),
      createdAt: publication.publishedAt,
    });
    const releasePath = await this.#store.saveRelease(release, publication);
    const deliveryPath = await this.#store.saveDelivery(
      createPendingDelivery(release, publication.publishedAt),
    );
    return {
      command: "publish",
      draftId: draft.id,
      paperId: stored.paper.id,
      slug: publication.slug,
      privatePublicationPath: this.#store.relative(recordPath),
      releasePath: this.#store.relative(releasePath),
      deliveryPath: this.#store.relative(deliveryPath),
      publicDigest: projection.sha256,
      changedPaths: [
        this.#store.relative(recordPath),
        this.#store.relative(releasePath),
        this.#store.relative(deliveryPath),
      ].sort(),
    };
  }
}

function checkpointFor(
  source: LiteratureSource,
  window: { from: string; through: string },
  cursor: string | undefined,
  runId: string,
  now: string,
  prior: Checkpoint | undefined,
): Checkpoint {
  return {
    schemaVersion: "1.0",
    sourceId: source.name,
    source: source.source,
    cursor: cursor ?? null,
    window,
    ...(!cursor
      ? { watermark: `${window.through}T23:59:59.999Z` }
      : prior?.watermark
        ? { watermark: prior.watermark }
        : {}),
    lastRunId: runId,
    lastSucceededAt: now,
    updatedAt: now,
    replayOverlapDays: source.overlapDays ?? prior?.replayOverlapDays ?? 0,
  };
}

function shiftIsoDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  invariant(
    !Number.isNaN(date.getTime()),
    "invalid_date",
    `Invalid discovery date: ${value}`,
  );
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function mergeEnrichments(
  values: readonly (StoredPaper["enrichment"] | undefined)[],
): StoredPaper["enrichment"] {
  const present = values.filter(Boolean) as StoredPaper["enrichment"][];
  const fullText = present.find((entry) => entry.fullText)?.fullText;
  return {
    ...(present.map((entry) => entry.doi).find(Boolean)
      ? { doi: present.map((entry) => entry.doi).find(Boolean)! }
      : {}),
    affiliations: [
      ...new Set(present.flatMap((entry) => entry.affiliations ?? [])),
    ],
    citationCount: Math.max(
      0,
      ...present.map((entry) => entry.citationCount ?? 0),
    ),
    codeUrls: [...new Set(present.flatMap((entry) => entry.codeUrls ?? []))],
    dataUrls: [...new Set(present.flatMap((entry) => entry.dataUrls ?? []))],
    ...(fullText ? { fullText } : {}),
  };
}

function publicationSlug(title: string, paperId: string): string {
  // Importing publication's internal slug function would widen the module surface.
  const normalized = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  return `${normalized}-${sha256(paperId).slice(0, 7)}`;
}
