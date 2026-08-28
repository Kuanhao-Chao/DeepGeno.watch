import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CandidateBatchSchema,
  CandidateSchema,
  CheckpointSchema,
  DecisionBatchSchema,
  DraftDecisionBatchSchema,
  DraftSummarySchema,
  PaperSchema,
  PublishedPaperSchema,
  type Candidate,
  type CandidateBatch,
  type Checkpoint,
  type DecisionBatch,
  type DraftDecisionBatch,
  type DraftSummary,
  type Paper,
  type PublishedPaper,
} from "@deepgeno/contracts";
import type { Enrichment, SourceDocument } from "./ports.js";
import { LiteratureError, invariant } from "./errors.js";
import { stableJson } from "./util.js";

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

  async writeReview(name: string, markdown: string): Promise<string> {
    const target = this.privatePath("reviews", `${safeId(name)}.md`);
    await this.writeText(target, markdown);
    return target;
  }

  async writePublicPaper(slug: string, markdown: string): Promise<string> {
    const target = path.join(
      this.root,
      "content",
      "public",
      "papers",
      `${safeId(slug)}.md`,
    );
    await this.writeText(target, markdown);
    return target;
  }

  relative(target: string): string {
    return path.relative(this.root, target);
  }

  privatePath(...segments: string[]): string {
    return path.join(this.root, "data", "private", ...segments);
  }

  async writeJson(target: string, value: unknown): Promise<void> {
    await this.writeText(target, stableJson(value));
  }

  async writeImmutableJson(target: string, value: unknown): Promise<void> {
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

  async readJson<T = unknown>(target: string): Promise<T> {
    return JSON.parse(await readFile(target, "utf8")) as T;
  }

  async readDirectory<T>(directory: string): Promise<T[]> {
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

  async writeText(target: string, content: string): Promise<void> {
    invariant(
      target.startsWith(`${this.root}${path.sep}`),
      "path_outside_root",
      "Refusing to write outside repository root",
    );
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, target);
  }
}

function safeId(value: string): string {
  invariant(
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value),
    "invalid_file_id",
    `Unsafe file identifier: ${value}`,
  );
  return value;
}
