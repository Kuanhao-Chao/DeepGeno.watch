import { z } from "zod";

export const ContractVersionSchema = z.literal("1.0");
export type ContractVersion = z.infer<typeof ContractVersionSchema>;

export const NonEmptyStringSchema = z.string().trim().min(1);
export const IsoDateSchema = z.string().date();
export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export const Sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/i, "Expected a SHA-256 digest");
export const UrlSchema = z.string().url();

export const PriorityValues = ["must-read", "recommended", "notable"] as const;
export const PrioritySchema = z.enum(PriorityValues);
export type Priority = z.infer<typeof PrioritySchema>;

export const ProgressValues = ["queued", "skimmed", "read"] as const;
export const ProgressSchema = z.enum(ProgressValues);
export type Progress = z.infer<typeof ProgressSchema>;

export const TopicValues = [
  "sequence-to-function",
  "dna-language-model",
  "rna-language-model",
  "protein-language-model",
  "variant-effect-prediction",
  "gene-regulation",
  "epigenomics",
  "single-cell-deep-learning",
  "structural-bioinformatics",
] as const;
export const TopicSchema = z.enum(TopicValues);
export type Topic = z.infer<typeof TopicSchema>;

export const EvidenceScopeValues = [
  "abstract-only",
  "partial-full-text",
  "full-text",
] as const;
export const EvidenceScopeSchema = z.enum(EvidenceScopeValues);
export type EvidenceScope = z.infer<typeof EvidenceScopeSchema>;

export const ModelProviderValues = ["openai", "anthropic"] as const;
export const ModelProviderSchema = z.enum(ModelProviderValues);
export type ModelProvider = z.infer<typeof ModelProviderSchema>;

export const ActorSchema = z
  .object({
    id: NonEmptyStringSchema,
    displayName: NonEmptyStringSchema.optional(),
    kind: z.enum(["human", "automation"]),
  })
  .strict();
export type Actor = z.infer<typeof ActorSchema>;

export const ContractIssueSchema = z
  .object({
    code: NonEmptyStringSchema,
    message: NonEmptyStringSchema,
    path: z.array(z.union([z.string(), z.number()])),
  })
  .strict();
export type ContractIssue = z.infer<typeof ContractIssueSchema>;
