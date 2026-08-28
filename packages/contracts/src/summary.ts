import { z } from "zod";

import { EvidencePacketSchema } from "./evidence.js";
import {
  ContractVersionSchema,
  EvidenceScopeSchema,
  IsoDateTimeSchema,
  ModelProviderSchema,
  NonEmptyStringSchema,
  Sha256Schema,
  TopicSchema,
  UrlSchema,
} from "./primitives.js";

export const EvidenceBackedStatementSchema = z
  .object({
    statement: NonEmptyStringSchema,
    evidenceIds: z.array(NonEmptyStringSchema).min(1),
  })
  .strict();
export type EvidenceBackedStatement = z.infer<
  typeof EvidenceBackedStatementSchema
>;

export const DatasetUseSchema = z
  .object({
    name: NonEmptyStringSchema,
    role: z.enum([
      "pretraining",
      "fine-tuning",
      "validation",
      "testing",
      "benchmark",
    ]),
    // Model-facing schemas require every field. Null means the evidence did
    // not report a value and prevents a model from filling the gap by guess.
    scale: NonEmptyStringSchema.nullable(),
    organisms: z.array(NonEmptyStringSchema),
    evidenceIds: z.array(NonEmptyStringSchema).min(1),
  })
  .strict();
export type DatasetUse = z.infer<typeof DatasetUseSchema>;

export const QuantitativeResultSchema = z
  .object({
    claim: NonEmptyStringSchema,
    metric: NonEmptyStringSchema.nullable(),
    value: NonEmptyStringSchema.nullable(),
    baseline: NonEmptyStringSchema.nullable(),
    delta: NonEmptyStringSchema.nullable(),
    benchmark: NonEmptyStringSchema.nullable(),
    evidenceIds: z.array(NonEmptyStringSchema).min(1),
  })
  .strict();
export type QuantitativeResult = z.infer<typeof QuantitativeResultSchema>;

export const TechnicalSummarySchema = z
  .object({
    schemaVersion: ContractVersionSchema,
    hook: NonEmptyStringSchema,
    coreProblem: EvidenceBackedStatementSchema,
    novelty: z.array(EvidenceBackedStatementSchema).min(1),
    architecture: z
      .object({
        overview: NonEmptyStringSchema,
        modelFamily: NonEmptyStringSchema.nullable(),
        parameterScale: NonEmptyStringSchema.nullable(),
        representation: NonEmptyStringSchema.nullable(),
        tokenization: NonEmptyStringSchema.nullable(),
        contextLength: NonEmptyStringSchema.nullable(),
        trainingObjectives: z.array(NonEmptyStringSchema),
        evidenceIds: z.array(NonEmptyStringSchema).min(1),
      })
      .strict(),
    data: z
      .object({
        datasets: z.array(DatasetUseSchema),
        benchmarks: z.array(DatasetUseSchema),
      })
      .strict(),
    quantitativeResults: z.array(QuantitativeResultSchema),
    takeaways: z.array(EvidenceBackedStatementSchema).min(1),
    limitations: z.array(EvidenceBackedStatementSchema),
    topics: z.array(TopicSchema).min(1),
    tags: z.array(NonEmptyStringSchema).min(1),
    organisms: z.array(NonEmptyStringSchema),
    modalities: z.array(NonEmptyStringSchema),
    links: z
      .object({
        code: UrlSchema.nullable(),
        data: UrlSchema.nullable(),
        project: UrlSchema.nullable(),
      })
      .strict(),
    evidenceScope: EvidenceScopeSchema,
  })
  .strict();
export type TechnicalSummary = z.infer<typeof TechnicalSummarySchema>;

export const GenerationProvenanceSchema = z
  .object({
    provider: ModelProviderSchema,
    model: NonEmptyStringSchema,
    generatedAt: IsoDateTimeSchema,
    prompt: z
      .object({
        id: NonEmptyStringSchema,
        version: NonEmptyStringSchema,
        sha256: Sha256Schema,
      })
      .strict(),
    outputSchemaVersion: ContractVersionSchema,
    inputSha256: Sha256Schema,
    requestId: NonEmptyStringSchema.optional(),
    usage: z
      .object({
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type GenerationProvenance = z.infer<typeof GenerationProvenanceSchema>;

const collectEvidenceIds = (summary: TechnicalSummary): string[] => [
  ...summary.coreProblem.evidenceIds,
  ...summary.novelty.flatMap((item) => item.evidenceIds),
  ...summary.architecture.evidenceIds,
  ...summary.data.datasets.flatMap((item) => item.evidenceIds),
  ...summary.data.benchmarks.flatMap((item) => item.evidenceIds),
  ...summary.quantitativeResults.flatMap((item) => item.evidenceIds),
  ...summary.takeaways.flatMap((item) => item.evidenceIds),
  ...summary.limitations.flatMap((item) => item.evidenceIds),
];

export const DraftSummarySchema = z
  .object({
    schemaVersion: ContractVersionSchema,
    id: NonEmptyStringSchema,
    revision: z.number().int().positive(),
    supersedesDraftId: NonEmptyStringSchema.optional(),
    candidateId: NonEmptyStringSchema,
    candidateRevision: z.number().int().positive(),
    paperId: NonEmptyStringSchema,
    summary: TechnicalSummarySchema,
    evidence: EvidencePacketSchema,
    generation: GenerationProvenanceSchema,
    recordSha256: Sha256Schema,
  })
  .strict()
  .superRefine((draft, context) => {
    if (draft.revision === 1 && draft.supersedesDraftId !== undefined) {
      context.addIssue({
        code: "custom",
        message: "An initial draft cannot supersede another draft",
        path: ["supersedesDraftId"],
      });
    }
    if (draft.revision > 1 && draft.supersedesDraftId === undefined) {
      context.addIssue({
        code: "custom",
        message: "A revised draft must identify the draft it supersedes",
        path: ["supersedesDraftId"],
      });
    }
    if (draft.evidence.paperId !== draft.paperId) {
      context.addIssue({
        code: "custom",
        message: "The evidence packet belongs to a different paper",
        path: ["evidence", "paperId"],
      });
    }
    if (draft.summary.evidenceScope !== draft.evidence.scope) {
      context.addIssue({
        code: "custom",
        message: "Summary and evidence packet scopes do not match",
        path: ["summary", "evidenceScope"],
      });
    }

    const available = new Set(
      draft.evidence.references.map((reference) => reference.id),
    );
    for (const id of new Set(collectEvidenceIds(draft.summary))) {
      if (!available.has(id)) {
        context.addIssue({
          code: "custom",
          message: `Summary cites unknown evidence: ${id}`,
          path: ["summary"],
        });
      }
    }
  });
export type DraftSummary = z.infer<typeof DraftSummarySchema>;
