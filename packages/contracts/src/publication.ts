import { z } from "zod";

import { PublicEvidenceCitationSchema } from "./evidence.js";
import { PaperSchema } from "./paper.js";
import {
  ActorSchema,
  ContractVersionSchema,
  EvidenceScopeSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  PrioritySchema,
  ProgressSchema,
  TopicSchema,
  UrlSchema,
} from "./primitives.js";
import {
  DatasetUseSchema,
  EvidenceBackedStatementSchema,
  GenerationProvenanceSchema,
  QuantitativeResultSchema,
  TechnicalSummarySchema,
} from "./summary.js";
import { SourceNameSchema } from "./source.js";

export const PublicationReviewSchema = z
  .object({
    draftId: NonEmptyStringSchema,
    draftRevision: z.number().int().positive(),
    approvedAt: IsoDateTimeSchema,
    approvedBy: ActorSchema,
    pullRequestUrl: UrlSchema.optional(),
    commitSha: z
      .string()
      .regex(/^[a-f0-9]{7,64}$/i)
      .optional(),
  })
  .strict();
export type PublicationReview = z.infer<typeof PublicationReviewSchema>;

export const PublishedPaperSchema = z
  .object({
    schemaVersion: ContractVersionSchema,
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    paper: PaperSchema,
    summary: TechnicalSummarySchema,
    priority: PrioritySchema,
    progress: ProgressSchema,
    publishedAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    review: PublicationReviewSchema,
    evidence: z
      .object({
        scope: EvidenceScopeSchema,
        citations: z.array(PublicEvidenceCitationSchema).min(1),
      })
      .strict(),
  })
  .strict();
export type PublishedPaper = z.infer<typeof PublishedPaperSchema>;

/**
 * The complete, public Astro frontmatter contract. Summary claims retain evidence
 * IDs so a single canonical record can power cards, lists, and deep-dive pages.
 */
export const PublicPaperSchema = z
  .object({
    schemaVersion: ContractVersionSchema,
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    paperId: NonEmptyStringSchema,
    title: NonEmptyStringSchema,
    authors: z.array(NonEmptyStringSchema).min(1),
    publicationDate: IsoDateSchema.optional(),
    publishedAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    source: SourceNameSchema,
    venue: NonEmptyStringSchema.optional(),
    doi: NonEmptyStringSchema.optional(),
    url: UrlSchema,
    pdfUrl: UrlSchema.optional(),
    codeUrl: UrlSchema.optional(),
    dataUrl: UrlSchema.optional(),
    hook: NonEmptyStringSchema,
    priority: PrioritySchema,
    progress: ProgressSchema,
    tags: z.array(NonEmptyStringSchema).min(1),
    topics: z.array(TopicSchema).min(1),
    organisms: z.array(NonEmptyStringSchema),
    modalities: z.array(NonEmptyStringSchema),
    evidence: z
      .object({
        scope: EvidenceScopeSchema,
        fullTextAvailable: z.boolean(),
        sources: z.array(PublicEvidenceCitationSchema).min(1),
      })
      .strict(),
    coreProblem: EvidenceBackedStatementSchema,
    novelty: z.array(EvidenceBackedStatementSchema).min(1),
    architecture: TechnicalSummarySchema.shape.architecture,
    datasets: z.array(DatasetUseSchema),
    benchmarks: z.array(DatasetUseSchema),
    results: z.array(QuantitativeResultSchema),
    takeaways: z.array(EvidenceBackedStatementSchema).min(1),
    limitations: z.array(EvidenceBackedStatementSchema),
    provenance: z
      .object({
        generation: GenerationProvenanceSchema,
        review: PublicationReviewSchema,
      })
      .strict(),
  })
  .strict();
export type PublicPaper = z.infer<typeof PublicPaperSchema>;

export const PublicPaperFrontmatterSchema = PublicPaperSchema;
export type PublicPaperFrontmatter = z.infer<
  typeof PublicPaperFrontmatterSchema
>;

export const PublicPaperDocumentSchema = z
  .object({
    frontmatter: PublicPaperFrontmatterSchema,
  })
  .strict();
export type PublicPaperDocument = z.infer<typeof PublicPaperDocumentSchema>;
