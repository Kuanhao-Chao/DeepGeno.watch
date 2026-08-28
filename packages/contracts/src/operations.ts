import { z } from "zod";

import { CandidateSchema } from "./paper.js";
import {
  ContractVersionSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  ModelProviderSchema,
  NonEmptyStringSchema,
  Sha256Schema,
  TopicSchema,
} from "./primitives.js";
import { SourceNameSchema } from "./source.js";

export const RunProvenanceSchema = z
  .object({
    runId: NonEmptyStringSchema,
    trigger: z.enum(["schedule", "manual", "replay", "test"]),
    startedAt: IsoDateTimeSchema,
    completedAt: IsoDateTimeSchema,
    revision: NonEmptyStringSchema.optional(),
  })
  .strict();
export type RunProvenance = z.infer<typeof RunProvenanceSchema>;

export const CandidateBatchSchema = z
  .object({
    schemaVersion: ContractVersionSchema,
    id: NonEmptyStringSchema,
    revision: z.number().int().positive(),
    window: z
      .object({
        from: IsoDateSchema,
        through: IsoDateSchema,
      })
      .strict(),
    generatedAt: IsoDateTimeSchema,
    candidates: z.array(CandidateSchema),
    run: RunProvenanceSchema,
    recordSha256: Sha256Schema,
  })
  .strict()
  .superRefine((batch, context) => {
    if (batch.window.from > batch.window.through) {
      context.addIssue({
        code: "custom",
        message: "Batch window is inverted",
        path: ["window"],
      });
    }
    const seen = new Set<string>();
    batch.candidates.forEach((candidate, index) => {
      if (seen.has(candidate.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate candidate: ${candidate.id}`,
          path: ["candidates", index, "id"],
        });
      }
      seen.add(candidate.id);
    });
  });
export type CandidateBatch = z.infer<typeof CandidateBatchSchema>;

export const CheckpointSchema = z
  .object({
    schemaVersion: ContractVersionSchema,
    sourceId: NonEmptyStringSchema,
    source: SourceNameSchema,
    cursor: NonEmptyStringSchema.nullable(),
    window: z
      .object({
        from: IsoDateSchema,
        through: IsoDateSchema,
      })
      .strict(),
    watermark: IsoDateTimeSchema.optional(),
    lastRunId: NonEmptyStringSchema,
    lastSucceededAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    replayOverlapDays: z.number().int().nonnegative(),
  })
  .strict();
export type Checkpoint = z.infer<typeof CheckpointSchema>;

export const ModelConfigSchema = z
  .object({
    provider: ModelProviderSchema,
    model: NonEmptyStringSchema,
    maxOutputTokens: z.number().int().positive(),
    temperature: z.number().min(0).max(2).optional(),
  })
  .strict();
export type ModelConfig = z.infer<typeof ModelConfigSchema>;

export const SourceConfigSchema = z
  .object({
    source: SourceNameSchema,
    enabled: z.boolean(),
    categories: z.array(NonEmptyStringSchema).optional(),
    journalIssns: z.array(NonEmptyStringSchema).optional(),
    overlapDays: z.number().int().nonnegative(),
  })
  .strict();
export type SourceConfig = z.infer<typeof SourceConfigSchema>;

export const AppConfigSchema = z
  .object({
    schemaVersion: ContractVersionSchema,
    timezone: NonEmptyStringSchema,
    schedule: NonEmptyStringSchema,
    sources: z.array(SourceConfigSchema).min(1),
    relevance: z
      .object({
        topics: z.array(TopicSchema).min(1),
        includeKeywords: z.array(NonEmptyStringSchema).min(1),
        excludeKeywords: z.array(NonEmptyStringSchema),
        threshold: z.number().min(0).max(1),
        model: ModelConfigSchema.optional(),
      })
      .strict(),
    synthesis: z
      .object({
        model: ModelConfigSchema,
        promptId: NonEmptyStringSchema,
        promptVersion: NonEmptyStringSchema,
      })
      .strict(),
  })
  .strict();
export type AppConfig = z.infer<typeof AppConfigSchema>;
