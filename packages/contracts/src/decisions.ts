import { z } from "zod";

import {
  ActorSchema,
  ContractVersionSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  PrioritySchema,
  ProgressSchema,
} from "./primitives.js";

export const CandidateDecisionValues = [
  "summarize",
  "defer",
  "dismiss",
] as const;
export const CandidateDecisionActionSchema = z.enum(CandidateDecisionValues);
export type CandidateDecisionAction = z.infer<
  typeof CandidateDecisionActionSchema
>;

export const CandidateDecisionSchema = z
  .object({
    candidateId: NonEmptyStringSchema,
    candidateRevision: z.number().int().positive(),
    action: CandidateDecisionActionSchema,
    decidedAt: IsoDateTimeSchema,
    decidedBy: ActorSchema,
    note: NonEmptyStringSchema.optional(),
    deferUntil: IsoDateTimeSchema.optional(),
  })
  .strict()
  .superRefine((decision, context) => {
    if (decision.action === "defer" && decision.deferUntil === undefined) {
      context.addIssue({
        code: "custom",
        message: "A defer decision must specify deferUntil",
        path: ["deferUntil"],
      });
    }
    if (decision.action !== "defer" && decision.deferUntil !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Only a defer decision can specify deferUntil",
        path: ["deferUntil"],
      });
    }
  });
export type CandidateDecision = z.infer<typeof CandidateDecisionSchema>;

export const DecisionBatchSchema = z
  .object({
    schemaVersion: ContractVersionSchema,
    id: NonEmptyStringSchema,
    candidateBatchId: NonEmptyStringSchema,
    candidateBatchRevision: z.number().int().positive(),
    recordedAt: IsoDateTimeSchema,
    decisions: z.array(CandidateDecisionSchema).min(1),
  })
  .strict()
  .superRefine((batch, context) => {
    const seen = new Set<string>();
    batch.decisions.forEach((decision, index) => {
      if (seen.has(decision.candidateId)) {
        context.addIssue({
          code: "custom",
          message: `Candidate has more than one decision: ${decision.candidateId}`,
          path: ["decisions", index, "candidateId"],
        });
      }
      seen.add(decision.candidateId);
    });
  });
export type DecisionBatch = z.infer<typeof DecisionBatchSchema>;

export const DraftDecisionValues = ["approve", "revise", "dismiss"] as const;
export const DraftDecisionActionSchema = z.enum(DraftDecisionValues);
export type DraftDecisionAction = z.infer<typeof DraftDecisionActionSchema>;

const DraftDecisionBaseSchema = z.object({
  draftId: NonEmptyStringSchema,
  draftRevision: z.number().int().positive(),
  decidedAt: IsoDateTimeSchema,
  decidedBy: ActorSchema,
});

export const DraftDecisionSchema = z.discriminatedUnion("action", [
  DraftDecisionBaseSchema.extend({
    action: z.literal("approve"),
    priority: PrioritySchema,
    progress: ProgressSchema,
    note: NonEmptyStringSchema.optional(),
  }).strict(),
  DraftDecisionBaseSchema.extend({
    action: z.literal("revise"),
    note: NonEmptyStringSchema.max(4_000),
  }).strict(),
  DraftDecisionBaseSchema.extend({
    action: z.literal("dismiss"),
    note: NonEmptyStringSchema.optional(),
  }).strict(),
]);
export type DraftDecision = z.infer<typeof DraftDecisionSchema>;

export const DraftDecisionBatchSchema = z
  .object({
    schemaVersion: ContractVersionSchema,
    id: NonEmptyStringSchema,
    recordedAt: IsoDateTimeSchema,
    decisions: z.array(DraftDecisionSchema).min(1),
  })
  .strict()
  .superRefine((batch, context) => {
    const seen = new Set<string>();
    batch.decisions.forEach((decision, index) => {
      if (seen.has(decision.draftId)) {
        context.addIssue({
          code: "custom",
          message: `Draft has more than one decision: ${decision.draftId}`,
          path: ["decisions", index, "draftId"],
        });
      }
      seen.add(decision.draftId);
    });
  });
export type DraftDecisionBatch = z.infer<typeof DraftDecisionBatchSchema>;
