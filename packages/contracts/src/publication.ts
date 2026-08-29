import { z } from "zod";

import { PublicEvidenceCitationSchema as PrivateEvidenceCitationSchema } from "./evidence.js";
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
        citations: z.array(PrivateEvidenceCitationSchema).min(1),
      })
      .strict(),
  })
  .strict();
export type PublishedPaper = z.infer<typeof PublishedPaperSchema>;

export const PublicEvidenceIdSchema = z.string().regex(/^e[1-9][0-9]*$/);
const PublicEvidenceIdsSchema = z.array(PublicEvidenceIdSchema).min(1);

const PublicEvidenceCitationSchema = z
  .object({
    id: PublicEvidenceIdSchema,
    documentKind: z.enum(["abstract", "jats", "html", "pdf", "supplement"]),
    sourceUrl: UrlSchema,
    locator: z
      .object({
        section: NonEmptyStringSchema.optional(),
        paragraph: z.number().int().positive().optional(),
        page: z.number().int().positive().optional(),
        figure: NonEmptyStringSchema.optional(),
        table: NonEmptyStringSchema.optional(),
      })
      .strict(),
  })
  .strict();

const PublicEvidenceBackedStatementSchema =
  EvidenceBackedStatementSchema.extend({
    evidenceIds: PublicEvidenceIdsSchema,
  });
const PublicDatasetUseSchema = DatasetUseSchema.extend({
  evidenceIds: PublicEvidenceIdsSchema,
});
const PublicQuantitativeResultSchema = QuantitativeResultSchema.extend({
  evidenceIds: PublicEvidenceIdsSchema,
});
const PublicArchitectureSchema =
  TechnicalSummarySchema.shape.architecture.extend({
    evidenceIds: PublicEvidenceIdsSchema,
  });

const PublicGenerationProvenanceSchema = z
  .object({
    provider: GenerationProvenanceSchema.shape.provider,
    model: GenerationProvenanceSchema.shape.model,
    generatedAt: GenerationProvenanceSchema.shape.generatedAt,
    prompt: z
      .object({
        id: NonEmptyStringSchema,
        version: NonEmptyStringSchema,
      })
      .strict(),
    outputSchemaVersion: ContractVersionSchema,
  })
  .strict();

const PublicReviewProvenanceSchema = z
  .object({ approvedAt: IsoDateTimeSchema })
  .strict();

/**
 * The complete, public Astro frontmatter contract. Summary claims retain evidence
 * IDs so a single canonical record can power cards, lists, and deep-dive pages.
 */
export const PublicPaperSchema = z
  .object({
    schemaVersion: z.literal("2.0"),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
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
    projectUrl: UrlSchema.optional(),
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
    coreProblem: PublicEvidenceBackedStatementSchema,
    novelty: z.array(PublicEvidenceBackedStatementSchema).min(1),
    architecture: PublicArchitectureSchema,
    datasets: z.array(PublicDatasetUseSchema),
    benchmarks: z.array(PublicDatasetUseSchema),
    results: z.array(PublicQuantitativeResultSchema),
    takeaways: z.array(PublicEvidenceBackedStatementSchema).min(1),
    limitations: z.array(PublicEvidenceBackedStatementSchema),
    provenance: z
      .object({
        generation: PublicGenerationProvenanceSchema,
        review: PublicReviewProvenanceSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((paper, context) => {
    const sourceIds = new Set<string>();
    paper.evidence.sources.forEach((source, index) => {
      if (sourceIds.has(source.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate public evidence source: ${source.id}`,
          path: ["evidence", "sources", index, "id"],
        });
      }
      sourceIds.add(source.id);
    });

    const references: Array<{ ids: string[]; path: (string | number)[] }> = [
      {
        ids: paper.coreProblem.evidenceIds,
        path: ["coreProblem", "evidenceIds"],
      },
      ...paper.novelty.map((entry, index) => ({
        ids: entry.evidenceIds,
        path: ["novelty", index, "evidenceIds"],
      })),
      {
        ids: paper.architecture.evidenceIds,
        path: ["architecture", "evidenceIds"],
      },
      ...paper.datasets.map((entry, index) => ({
        ids: entry.evidenceIds,
        path: ["datasets", index, "evidenceIds"],
      })),
      ...paper.benchmarks.map((entry, index) => ({
        ids: entry.evidenceIds,
        path: ["benchmarks", index, "evidenceIds"],
      })),
      ...paper.results.map((entry, index) => ({
        ids: entry.evidenceIds,
        path: ["results", index, "evidenceIds"],
      })),
      ...paper.takeaways.map((entry, index) => ({
        ids: entry.evidenceIds,
        path: ["takeaways", index, "evidenceIds"],
      })),
      ...paper.limitations.map((entry, index) => ({
        ids: entry.evidenceIds,
        path: ["limitations", index, "evidenceIds"],
      })),
    ];
    references.forEach(({ ids, path }) => {
      ids.forEach((id, index) => {
        if (!sourceIds.has(id)) {
          context.addIssue({
            code: "custom",
            message: `Public summary cites unknown evidence: ${id}`,
            path: [...path, index],
          });
        }
      });
    });
  });
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
