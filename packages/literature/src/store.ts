import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import {
  CandidateBatchSchema,
  CandidateSchema,
  CheckpointSchema,
  DecisionBatchSchema,
  DraftDecisionBatchSchema,
  DraftSummarySchema,
  EvidencePacketSchema,
  PaperSchema,
  PublishedPaperSchema,
  TechnicalSummarySchema,
  type Candidate,
  type CandidateBatch,
  type Checkpoint,
  type DecisionBatch,
  type DraftDecisionBatch,
  type DraftSummary,
  type EvidencePacket,
  type Paper,
  type PublishedPaper,
  type TechnicalSummary,
} from "@deepgeno/contracts";
import type {
  Enrichment,
  SourceDocument,
  StructuredModelResponse,
} from "./ports.js";
import { LiteratureError, invariant } from "./errors.js";
import {
  projectionFromRelease,
  transitionDelivery as transitionDeliveryRecord,
  validateDelivery,
  validateDeliveryReleaseLink,
  validateReleasePublicationLink,
  validateRelease,
  type Delivery,
  type DeliveryTransitionDetails,
  type DeliveryState,
  type PrivateRelease,
} from "./release.js";
import { sha256, stableJson } from "./util.js";

export interface StoredPaper {
  paper: Paper;
  candidate: Candidate;
  sourceDocuments: SourceDocument[];
  enrichment: Enrichment;
}

export interface DraftReviewContext {
  draftId: string;
  pullRequestUrl?: string;
  commitSha?: string;
}

export interface SynthesisRequestDescriptor {
  paperId: string;
  candidateId: string;
  candidateRevision: number;
  draftId: string;
  draftRevision: number;
  supersedesDraftId?: string;
  provider: StructuredModelResponse["provider"];
  model: string;
  prompt: { id: string; version: string; sha256: string };
  outputSchemaVersion: "1.0";
  evidence: EvidencePacket;
  revisionFeedback?: string;
}

export interface SynthesisResult {
  summary: TechnicalSummary;
  provider: StructuredModelResponse["provider"];
  model: string;
  promptSha256: string;
  responseId?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface SynthesisReconciliation {
  priorState: "armed" | "dispatching" | "ambiguous";
  reconciledAt: string;
  note: string;
}

interface SynthesisRequestBase extends SynthesisRequestDescriptor {
  schemaVersion: "1.0";
  id: string;
  requestSha256: string;
  createdAt: string;
  updatedAt: string;
  reconciliations: SynthesisReconciliation[];
}

export type SynthesisRequest = SynthesisRequestBase &
  (
    | { state: "prepared" }
    | {
        state: "armed" | "dispatching";
        armedAt: string;
        executionTokenSha256: string;
      }
    | {
        state: "ambiguous";
        armedAt: string;
        ambiguousAt: string;
        executionTokenSha256: string;
      }
    | { state: "completed"; completedAt: string; result: SynthesisResult }
  );

export function synthesisRequestId(draftId: string): string {
  invariant(draftId.trim(), "draft_id_required", "Draft ID is required");
  return `synthesis-${sha256(draftId)}`;
}

export class GitFileStateStore {
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  async savePaper(value: StoredPaper): Promise<string[]> {
    PaperSchema.parse(value.paper);
    CandidateSchema.parse(value.candidate);
    const privatePaper = this.privatePath(
      "papers",
      `${safeId(value.paper.id)}.json`,
    );
    const candidate = this.privatePath(
      "candidates",
      `${safeId(value.candidate.id)}.json`,
    );
    await Promise.all([
      this.writeJson(privatePaper, value),
      this.writeJson(candidate, value.candidate),
    ]);
    return [privatePaper, candidate];
  }

  async loadPaper(paperId: string): Promise<StoredPaper> {
    const value = await this.readJson<StoredPaper>(
      this.privatePath("papers", `${safeId(paperId)}.json`),
    );
    PaperSchema.parse(value.paper);
    CandidateSchema.parse(value.candidate);
    return value;
  }

  async findPaperByCandidate(candidateId: string): Promise<StoredPaper> {
    const candidate = CandidateSchema.parse(
      await this.readJson(
        this.privatePath("candidates", `${safeId(candidateId)}.json`),
      ),
    );
    return this.loadPaper(candidate.paper.id);
  }

  async listPapers(): Promise<StoredPaper[]> {
    return this.readDirectory<StoredPaper>(this.privatePath("papers"));
  }

  async saveCandidateBatch(batch: CandidateBatch): Promise<string> {
    CandidateBatchSchema.parse(batch);
    const target = this.privatePath("batches", `${safeId(batch.id)}.json`);
    await this.writeJson(target, batch);
    return target;
  }

  async loadCandidateBatch(batchId: string): Promise<CandidateBatch> {
    return CandidateBatchSchema.parse(
      await this.readJson(
        this.privatePath("batches", `${safeId(batchId)}.json`),
      ),
    );
  }

  async listCandidateBatches(): Promise<CandidateBatch[]> {
    const values = await this.readDirectory<unknown>(
      this.privatePath("batches"),
    );
    return values.map((value) => CandidateBatchSchema.parse(value));
  }

  async saveCheckpoint(checkpoint: Checkpoint): Promise<string> {
    CheckpointSchema.parse(checkpoint);
    const target = this.privatePath(
      "checkpoints",
      `${safeId(checkpoint.sourceId)}.json`,
    );
    await this.writeJson(target, checkpoint);
    return target;
  }

  async loadCheckpoint(sourceId: string): Promise<Checkpoint | undefined> {
    try {
      return CheckpointSchema.parse(
        await this.readJson(
          this.privatePath("checkpoints", `${safeId(sourceId)}.json`),
        ),
      );
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return undefined;
      }
      throw error;
    }
  }

  async listCheckpoints(): Promise<Checkpoint[]> {
    const values = await this.readDirectory<unknown>(
      this.privatePath("checkpoints"),
    );
    return values.map((value) => CheckpointSchema.parse(value));
  }

  async saveCandidateDecisions(batch: DecisionBatch): Promise<string> {
    DecisionBatchSchema.parse(batch);
    const target = this.privatePath(
      "decisions",
      "candidates",
      `${safeId(batch.id)}.json`,
    );
    await this.writeImmutableJson(target, batch);
    return target;
  }

  async listCandidateDecisions(): Promise<DecisionBatch[]> {
    const values = await this.readDirectory<unknown>(
      this.privatePath("decisions", "candidates"),
    );
    return values.map((value) => DecisionBatchSchema.parse(value));
  }

  async saveDraft(draft: DraftSummary): Promise<string> {
    DraftSummarySchema.parse(draft);
    const target = this.privatePath("drafts", `${safeId(draft.id)}.json`);
    await this.writeImmutableJson(target, draft);
    return target;
  }

  async loadDraft(draftId: string): Promise<DraftSummary> {
    return DraftSummarySchema.parse(
      await this.readJson(
        this.privatePath("drafts", `${safeId(draftId)}.json`),
      ),
    );
  }

  async listDrafts(): Promise<DraftSummary[]> {
    const values = await this.readDirectory<unknown>(
      this.privatePath("drafts"),
    );
    return values.map((value) => DraftSummarySchema.parse(value));
  }

  async prepareSynthesisRequest(
    descriptor: SynthesisRequestDescriptor,
    preparedAt: string,
  ): Promise<{ request: SynthesisRequest; path: string; changed: boolean }> {
    validateSynthesisDescriptor(descriptor);
    validateTimestamp(preparedAt, "preparedAt");
    const id = synthesisRequestId(descriptor.draftId);
    return this.withSynthesisLock(id, async () => {
      const existing = await this.loadSynthesisRequest(id);
      const target = this.synthesisRequestPath(id);
      if (existing) {
        invariant(
          existing.requestSha256 === synthesisRequestSha256(descriptor),
          "synthesis_request_conflict",
          `Synthesis target already has different immutable inputs: ${descriptor.draftId}`,
        );
        return { request: existing, path: target, changed: false };
      }
      const request: SynthesisRequest = {
        schemaVersion: "1.0",
        id,
        ...descriptor,
        requestSha256: synthesisRequestSha256(descriptor),
        state: "prepared",
        createdAt: preparedAt,
        updatedAt: preparedAt,
        reconciliations: [],
      };
      validateSynthesisRequest(request);
      await this.writeJson(target, request);
      return { request, path: target, changed: true };
    });
  }

  async loadSynthesisRequest(
    requestId: string,
  ): Promise<SynthesisRequest | undefined> {
    try {
      const request = await this.readJson<SynthesisRequest>(
        this.synthesisRequestPath(requestId),
      );
      validateSynthesisRequest(request);
      return request;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      )
        return undefined;
      throw error;
    }
  }

  async armSynthesisRequest(
    requestId: string,
    armedAt: string,
  ): Promise<{
    request: SynthesisRequest;
    path: string;
    executionToken: string;
  }> {
    validateTimestamp(armedAt, "armedAt");
    return this.withSynthesisLock(requestId, async () => {
      const existing = await this.loadSynthesisRequest(requestId);
      invariant(
        existing,
        "synthesis_request_missing",
        `Synthesis request does not exist: ${requestId}`,
      );
      invariant(
        existing.state === "prepared",
        "synthesis_reconciliation_required",
        `Synthesis request ${requestId} is ${existing.state}; explicit operator reconciliation is required before another model call`,
      );
      const executionToken = randomBytes(32).toString("base64url");
      const request: SynthesisRequest = {
        ...existing,
        state: "armed",
        armedAt,
        executionTokenSha256: sha256(executionToken),
        updatedAt: armedAt,
      };
      validateSynthesisRequest(request);
      const target = this.synthesisRequestPath(requestId);
      await this.writeJson(target, request);
      return { request, path: target, executionToken };
    });
  }

  async beginSynthesisRequest(
    requestId: string,
    executionToken: string,
    dispatchedAt: string,
  ): Promise<{ request: SynthesisRequest; path: string }> {
    validateTimestamp(dispatchedAt, "dispatchedAt");
    return this.withSynthesisLock(requestId, async () => {
      const existing = await this.loadSynthesisRequest(requestId);
      invariant(
        existing,
        "synthesis_request_missing",
        `Synthesis request does not exist: ${requestId}`,
      );
      invariant(
        existing.state === "armed",
        "synthesis_reconciliation_required",
        `Synthesis request ${requestId} is ${existing.state}; explicit operator reconciliation is required before another model call`,
      );
      invariant(
        sha256(executionToken) === existing.executionTokenSha256,
        "synthesis_execution_token_invalid",
        "Synthesis execution token is invalid or no longer current",
      );
      const request: SynthesisRequest = {
        ...existing,
        state: "dispatching",
        updatedAt: dispatchedAt,
      };
      const target = this.synthesisRequestPath(requestId);
      await this.writeJson(target, request);
      return { request, path: target };
    });
  }

  async completeSynthesisRequest(
    requestId: string,
    executionToken: string,
    result: SynthesisResult,
    completedAt: string,
  ): Promise<{ request: SynthesisRequest; path: string }> {
    validateTimestamp(completedAt, "completedAt");
    validateSynthesisResult(result);
    return this.withSynthesisLock(requestId, async () => {
      const existing = await this.loadSynthesisRequest(requestId);
      invariant(
        existing,
        "synthesis_request_missing",
        `Synthesis request does not exist: ${requestId}`,
      );
      invariant(
        existing.state === "dispatching" &&
          sha256(executionToken) === existing.executionTokenSha256,
        "synthesis_completion_conflict",
        `Synthesis request is not owned by this execution: ${requestId}`,
      );
      invariant(
        result.provider === existing.provider &&
          result.model === existing.model &&
          result.promptSha256 === existing.prompt.sha256,
        "synthesis_result_mismatch",
        `Synthesis result does not match its prepared request: ${requestId}`,
      );
      const request: SynthesisRequest = {
        ...synthesisBase(existing),
        state: "completed",
        completedAt,
        result,
        updatedAt: completedAt,
      };
      validateSynthesisRequest(request);
      const target = this.synthesisRequestPath(requestId);
      await this.writeJson(target, request);
      return { request, path: target };
    });
  }

  async markSynthesisAmbiguous(
    requestId: string,
    executionToken: string,
    ambiguousAt: string,
  ): Promise<{ request: SynthesisRequest; path: string }> {
    validateTimestamp(ambiguousAt, "ambiguousAt");
    return this.withSynthesisLock(requestId, async () => {
      const existing = await this.loadSynthesisRequest(requestId);
      invariant(
        existing,
        "synthesis_request_missing",
        `Synthesis request does not exist: ${requestId}`,
      );
      if (existing.state === "ambiguous")
        return {
          request: existing,
          path: this.synthesisRequestPath(requestId),
        };
      invariant(
        existing.state === "dispatching" &&
          sha256(executionToken) === existing.executionTokenSha256,
        "synthesis_ambiguity_conflict",
        `Synthesis request is not owned by this execution: ${requestId}`,
      );
      const request: SynthesisRequest = {
        ...existing,
        state: "ambiguous",
        ambiguousAt,
        updatedAt: ambiguousAt,
      };
      validateSynthesisRequest(request);
      const target = this.synthesisRequestPath(requestId);
      await this.writeJson(target, request);
      return { request, path: target };
    });
  }

  async reconcileSynthesisForRetry(
    requestId: string,
    expectedUpdatedAt: string,
    reconciledAt: string,
    note: string,
  ): Promise<{ request: SynthesisRequest; path: string }> {
    validateTimestamp(expectedUpdatedAt, "expectedUpdatedAt");
    validateTimestamp(reconciledAt, "reconciledAt");
    invariant(
      note.trim(),
      "synthesis_reconciliation_note_required",
      "Synthesis reconciliation requires an operator note",
    );
    return this.withSynthesisLock(requestId, async () => {
      const existing = await this.loadSynthesisRequest(requestId);
      invariant(
        existing,
        "synthesis_request_missing",
        `Synthesis request does not exist: ${requestId}`,
      );
      invariant(
        existing.updatedAt === expectedUpdatedAt,
        "synthesis_reconciliation_stale",
        `Synthesis request changed after operator inspection: ${requestId}`,
      );
      invariant(
        existing.state === "armed" ||
          existing.state === "dispatching" ||
          existing.state === "ambiguous",
        "synthesis_reconciliation_invalid",
        `Synthesis request ${requestId} is ${existing.state} and cannot be reconciled for retry`,
      );
      const reconciliation: SynthesisReconciliation = {
        priorState: existing.state,
        reconciledAt,
        note: note.trim(),
      };
      const request: SynthesisRequest = {
        ...synthesisBase(existing),
        state: "prepared",
        updatedAt: reconciledAt,
        reconciliations: [...existing.reconciliations, reconciliation],
      };
      validateSynthesisRequest(request);
      const target = this.synthesisRequestPath(requestId);
      await this.writeJson(target, request);
      return { request, path: target };
    });
  }

  async saveDraftDecisions(batch: DraftDecisionBatch): Promise<string> {
    DraftDecisionBatchSchema.parse(batch);
    const target = this.privatePath(
      "decisions",
      "drafts",
      `${safeId(batch.id)}.json`,
    );
    await this.writeImmutableJson(target, batch);
    return target;
  }

  async listDraftDecisions(): Promise<DraftDecisionBatch[]> {
    const values = await this.readDirectory<unknown>(
      this.privatePath("decisions", "drafts"),
    );
    return values.map((value) => DraftDecisionBatchSchema.parse(value));
  }

  async saveDraftReviewContext(context: DraftReviewContext): Promise<string> {
    invariant(
      !context.pullRequestUrl || /^https:\/\//.test(context.pullRequestUrl),
      "invalid_review_url",
      "Review pull request URL must use HTTPS",
    );
    invariant(
      !context.commitSha || /^[a-f0-9]{7,64}$/i.test(context.commitSha),
      "invalid_commit_sha",
      "Merge commit SHA is invalid",
    );
    const target = this.privatePath(
      "decisions",
      "drafts",
      "provenance",
      `${safeId(context.draftId)}.json`,
    );
    await this.writeImmutableJson(target, context);
    return target;
  }

  async loadDraftReviewContext(
    draftId: string,
  ): Promise<DraftReviewContext | undefined> {
    try {
      return await this.readJson(
        this.privatePath(
          "decisions",
          "drafts",
          "provenance",
          `${safeId(draftId)}.json`,
        ),
      );
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      )
        return undefined;
      throw error;
    }
  }

  async savePublication(publication: PublishedPaper): Promise<string> {
    PublishedPaperSchema.parse(publication);
    const prior = await this.findPublicationByPaperId(publication.paper.id);
    invariant(
      !prior || prior.slug === publication.slug,
      "publication_identity_conflict",
      `Paper already has an immutable publication: ${publication.paper.id}`,
    );
    const target = this.privatePath(
      "publications",
      `${safeId(publication.slug)}.json`,
    );
    await this.writeImmutableJson(target, publication);
    return target;
  }

  async loadPublication(slug: string): Promise<PublishedPaper | undefined> {
    try {
      return PublishedPaperSchema.parse(
        await this.readJson(
          this.privatePath("publications", `${safeId(slug)}.json`),
        ),
      );
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      )
        return undefined;
      throw error;
    }
  }

  async listPublications(): Promise<PublishedPaper[]> {
    const values = await this.readDirectory<unknown>(
      this.privatePath("publications"),
    );
    return values.map((value) => PublishedPaperSchema.parse(value));
  }

  async findPublicationByPaperId(
    paperId: string,
  ): Promise<PublishedPaper | undefined> {
    const matches = (await this.listPublications()).filter(
      (publication) => publication.paper.id === paperId,
    );
    invariant(
      matches.length <= 1,
      "publication_identity_conflict",
      `Multiple immutable publications exist for paper: ${paperId}`,
    );
    return matches[0];
  }

  async saveRelease(
    release: PrivateRelease,
    publication: PublishedPaper,
  ): Promise<string> {
    projectionFromRelease(release);
    validateReleasePublicationLink(release, publication);
    const target = this.privatePath("releases", `${safeId(release.id)}.json`);
    await this.writeImmutableJson(target, release);
    return target;
  }

  async loadReleaseForPublication(
    slug: string,
    publication: PublishedPaper,
  ): Promise<PrivateRelease | undefined> {
    const releases = (
      await this.readDirectory<PrivateRelease>(this.privatePath("releases"))
    ).map((release) => {
      validateRelease(release);
      return release;
    });
    const matches = releases.filter(
      (release) => release.publicationSlug === slug,
    );
    invariant(
      matches.length <= 1,
      "release_conflict",
      `Multiple private releases exist for publication: ${slug}`,
    );
    const release = matches[0];
    if (release) {
      projectionFromRelease(release);
      validateReleasePublicationLink(release, publication);
    }
    return release;
  }

  async saveDelivery(delivery: Delivery): Promise<string> {
    validateDelivery(delivery);
    const target = this.privatePath(
      "deliveries",
      `${safeId(delivery.id)}.json`,
    );
    await this.writeImmutableJson(target, delivery);
    return target;
  }

  async transitionDelivery(
    release: PrivateRelease,
    expectedState: DeliveryState,
    state: DeliveryState,
    updatedAt: string,
    details: DeliveryTransitionDetails = {},
  ): Promise<{ delivery: Delivery; path: string; changed: boolean }> {
    return this.withDeliveryLock(release.id, async () => {
      const existing = await this.loadDeliveryForRelease(release);
      invariant(
        existing,
        "delivery_missing",
        `Private delivery is missing for release: ${release.id}`,
      );
      if (existing.state !== expectedState) {
        if (existing.state === state) {
          transitionDeliveryRecord(existing, state, updatedAt, details);
          return {
            delivery: existing,
            path: this.deliveryPath(existing),
            changed: false,
          };
        }
        invariant(
          false,
          "delivery_state_conflict",
          `Delivery state changed from expected ${expectedState} to ${existing.state}`,
        );
      }
      const delivery = transitionDeliveryRecord(
        existing,
        state,
        updatedAt,
        details,
      );
      validateDeliveryReleaseLink(delivery, release);
      const target = this.privatePath(
        "deliveries",
        `${safeId(delivery.id)}.json`,
      );
      const changed = delivery !== existing;
      if (changed) await this.writeJson(target, delivery);
      return { delivery, path: target, changed };
    });
  }

  async loadDeliveryForRelease(
    release: PrivateRelease,
  ): Promise<Delivery | undefined> {
    validateRelease(release);
    const deliveries = (
      await this.readDirectory<Delivery>(this.privatePath("deliveries"))
    ).map((delivery) => {
      validateDelivery(delivery);
      return delivery;
    });
    const matches = deliveries.filter(
      (delivery) => delivery.releaseId === release.id,
    );
    invariant(
      matches.length <= 1,
      "delivery_conflict",
      `Multiple deliveries exist for release: ${release.id}`,
    );
    const delivery = matches[0];
    if (delivery) validateDeliveryReleaseLink(delivery, release);
    return delivery;
  }

  async writeReview(name: string, markdown: string): Promise<string> {
    const target = this.privatePath("reviews", `${safeId(name)}.md`);
    await this.writeText(target, markdown);
    return target;
  }

  relative(target: string): string {
    return path.relative(this.root, target);
  }

  publicationPath(slug: string): string {
    return this.privatePath("publications", `${safeId(slug)}.json`);
  }

  releasePath(release: PrivateRelease): string {
    return this.privatePath("releases", `${safeId(release.id)}.json`);
  }

  deliveryPath(delivery: Delivery): string {
    return this.privatePath("deliveries", `${safeId(delivery.id)}.json`);
  }

  synthesisRequestPath(requestId: string): string {
    return this.privatePath("synthesis-requests", `${safeId(requestId)}.json`);
  }

  private privatePath(...segments: string[]): string {
    return path.join(this.root, "data", "private", ...segments);
  }

  private async writeJson(target: string, value: unknown): Promise<void> {
    await this.writeText(target, stableJson(value));
  }

  private async writeImmutableJson(
    target: string,
    value: unknown,
  ): Promise<void> {
    const serialized = stableJson(value);
    try {
      const existing = await readFile(target, "utf8");
      if (existing !== serialized)
        throw new LiteratureError(
          "immutable_conflict",
          `Refusing to replace ${this.relative(target)}`,
        );
      return;
    } catch (error) {
      if (!(
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ))
        throw error;
    }
    await this.writeText(target, serialized);
  }

  private async readJson<T = unknown>(target: string): Promise<T> {
    return JSON.parse(await readFile(target, "utf8")) as T;
  }

  private async readDirectory<T>(directory: string): Promise<T[]> {
    let entries: string[];
    try {
      entries = await readdir(directory);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      )
        return [];
      throw error;
    }
    const json = entries.filter((entry) => entry.endsWith(".json")).sort();
    return Promise.all(
      json.map((entry) => this.readJson<T>(path.join(directory, entry))),
    );
  }

  private async writeText(target: string, content: string): Promise<void> {
    invariant(
      target.startsWith(`${this.privatePath()}${path.sep}`),
      "path_outside_root",
      "Refusing to write outside private state",
    );
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, target);
  }

  private async withDeliveryLock<T>(
    releaseId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const lockPath = this.privatePath(
      "deliveries",
      `.${safeId(releaseId)}.lock`,
    );
    await mkdir(path.dirname(lockPath), { recursive: true });
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      try {
        handle = await open(lockPath, "wx", 0o600);
        break;
      } catch (error) {
        if (!(
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "EEXIST"
        ))
          throw error;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    }
    invariant(
      handle,
      "delivery_lock_timeout",
      `Timed out waiting for delivery lock: ${releaseId}`,
    );
    try {
      return await operation();
    } finally {
      await handle.close();
      await unlink(lockPath).catch((error: unknown) => {
        if (!(
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "ENOENT"
        ))
          throw error;
      });
    }
  }

  private async withSynthesisLock<T>(
    requestId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const lockPath = this.privatePath(
      "synthesis-requests",
      `.${safeId(requestId)}.lock`,
    );
    await mkdir(path.dirname(lockPath), { recursive: true });
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      try {
        handle = await open(lockPath, "wx", 0o600);
        break;
      } catch (error) {
        if (!(
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "EEXIST"
        ))
          throw error;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    }
    invariant(
      handle,
      "synthesis_lock_timeout",
      `Timed out waiting for synthesis lock: ${requestId}`,
    );
    try {
      return await operation();
    } finally {
      await handle.close();
      await unlink(lockPath).catch((error: unknown) => {
        if (!(
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "ENOENT"
        ))
          throw error;
      });
    }
  }
}

function synthesisRequestSha256(
  descriptor: SynthesisRequestDescriptor,
): string {
  return sha256(stableJson(synthesisDescriptor(descriptor)));
}

function synthesisDescriptor(
  value: SynthesisRequestDescriptor,
): SynthesisRequestDescriptor {
  return {
    paperId: value.paperId,
    candidateId: value.candidateId,
    candidateRevision: value.candidateRevision,
    draftId: value.draftId,
    draftRevision: value.draftRevision,
    ...(value.supersedesDraftId
      ? { supersedesDraftId: value.supersedesDraftId }
      : {}),
    provider: value.provider,
    model: value.model,
    prompt: value.prompt,
    outputSchemaVersion: value.outputSchemaVersion,
    evidence: value.evidence,
    ...(value.revisionFeedback
      ? { revisionFeedback: value.revisionFeedback }
      : {}),
  };
}

function synthesisBase(request: SynthesisRequest): SynthesisRequestBase {
  const mutable = request as SynthesisRequest & {
    armedAt?: string;
    ambiguousAt?: string;
    completedAt?: string;
    executionTokenSha256?: string;
    result?: SynthesisResult;
  };
  const {
    state: _state,
    armedAt: _armedAt,
    ambiguousAt: _ambiguousAt,
    completedAt: _completedAt,
    executionTokenSha256: _executionTokenSha256,
    result: _result,
    ...base
  } = mutable;
  return base;
}

function validateSynthesisDescriptor(
  descriptor: SynthesisRequestDescriptor,
): void {
  safeId(descriptor.paperId);
  safeId(descriptor.candidateId);
  safeId(descriptor.draftId);
  if (descriptor.supersedesDraftId) safeId(descriptor.supersedesDraftId);
  invariant(
    Number.isInteger(descriptor.candidateRevision) &&
      descriptor.candidateRevision >= 1 &&
      Number.isInteger(descriptor.draftRevision) &&
      descriptor.draftRevision >= 1,
    "synthesis_revision_invalid",
    "Synthesis candidate and draft revisions must be positive integers",
  );
  invariant(
    ["openai", "anthropic", "fake"].includes(descriptor.provider) &&
      descriptor.model.trim().length > 0,
    "synthesis_model_invalid",
    "Synthesis request model identity is invalid",
  );
  invariant(
    descriptor.prompt.id.trim().length > 0 &&
      descriptor.prompt.version.trim().length > 0 &&
      /^[a-f0-9]{64}$/.test(descriptor.prompt.sha256),
    "synthesis_prompt_invalid",
    "Synthesis request prompt identity is invalid",
  );
  invariant(
    descriptor.outputSchemaVersion === "1.0",
    "synthesis_schema_invalid",
    "Synthesis output schema version is invalid",
  );
  EvidencePacketSchema.parse(descriptor.evidence);
  invariant(
    descriptor.evidence.inputSha256.length === 64,
    "synthesis_evidence_invalid",
    "Synthesis evidence digest is invalid",
  );
  if (descriptor.revisionFeedback !== undefined)
    invariant(
      descriptor.revisionFeedback.trim().length > 0,
      "synthesis_revision_feedback_invalid",
      "Synthesis revision feedback cannot be empty",
    );
}

function validateSynthesisResult(result: SynthesisResult): void {
  TechnicalSummarySchema.parse(result.summary);
  invariant(
    ["openai", "anthropic", "fake"].includes(result.provider) &&
      result.model.trim().length > 0 &&
      /^[a-f0-9]{64}$/.test(result.promptSha256),
    "synthesis_result_invalid",
    "Synthesis result metadata is invalid",
  );
  if (result.usage)
    invariant(
      Number.isInteger(result.usage.inputTokens) &&
        result.usage.inputTokens >= 0 &&
        Number.isInteger(result.usage.outputTokens) &&
        result.usage.outputTokens >= 0,
      "synthesis_usage_invalid",
      "Synthesis token usage is invalid",
    );
}

function validateSynthesisRequest(request: SynthesisRequest): void {
  invariant(
    request.schemaVersion === "1.0" &&
      request.id === synthesisRequestId(request.draftId),
    "synthesis_request_invalid",
    "Synthesis request identity is invalid",
  );
  validateSynthesisDescriptor(request);
  invariant(
    request.requestSha256 === synthesisRequestSha256(request),
    "synthesis_request_digest_mismatch",
    "Synthesis request immutable inputs do not match their digest",
  );
  validateTimestamp(request.createdAt, "createdAt");
  validateTimestamp(request.updatedAt, "updatedAt");
  invariant(
    Array.isArray(request.reconciliations),
    "synthesis_reconciliation_invalid",
    "Synthesis reconciliation history is invalid",
  );
  for (const reconciliation of request.reconciliations) {
    invariant(
      ["armed", "dispatching", "ambiguous"].includes(
        reconciliation.priorState,
      ) && reconciliation.note.trim().length > 0,
      "synthesis_reconciliation_invalid",
      "Synthesis reconciliation history is invalid",
    );
    validateTimestamp(reconciliation.reconciledAt, "reconciledAt");
  }
  if (request.state === "armed" || request.state === "dispatching") {
    validateTimestamp(request.armedAt, "armedAt");
    invariant(
      /^[a-f0-9]{64}$/.test(request.executionTokenSha256),
      "synthesis_execution_token_invalid",
      "Synthesis execution token digest is invalid",
    );
  } else if (request.state === "ambiguous") {
    validateTimestamp(request.armedAt, "armedAt");
    validateTimestamp(request.ambiguousAt, "ambiguousAt");
    invariant(
      /^[a-f0-9]{64}$/.test(request.executionTokenSha256),
      "synthesis_execution_token_invalid",
      "Synthesis execution token digest is invalid",
    );
  } else if (request.state === "completed") {
    validateTimestamp(request.completedAt, "completedAt");
    validateSynthesisResult(request.result);
    invariant(
      request.result.provider === request.provider &&
        request.result.model === request.model &&
        request.result.promptSha256 === request.prompt.sha256,
      "synthesis_result_mismatch",
      "Completed synthesis result does not match its request",
    );
  } else {
    invariant(
      request.state === "prepared",
      "synthesis_state_invalid",
      "Synthesis request state is invalid",
    );
  }
}

function validateTimestamp(value: string, field: string): void {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  invariant(
    typeof value === "string" &&
      value.length > 0 &&
      Number.isFinite(parsed) &&
      new Date(parsed).toISOString() === value,
    "synthesis_timestamp_invalid",
    `Synthesis ${field} must be an ISO date-time`,
  );
}

function safeId(value: string): string {
  invariant(
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value),
    "invalid_file_id",
    `Unsafe file identifier: ${value}`,
  );
  return value;
}
