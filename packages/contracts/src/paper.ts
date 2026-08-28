import { z } from "zod";

import {
  ContractVersionSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  Sha256Schema,
  TopicSchema,
  UrlSchema,
} from "./primitives.js";
import {
  AuthorSchema,
  ExternalIdentifierSchema,
  SourceRecordReferenceSchema,
} from "./source.js";

export const PaperSchema = z
  .object({
    schemaVersion: ContractVersionSchema,
    id: NonEmptyStringSchema,
    title: NonEmptyStringSchema,
    abstract: NonEmptyStringSchema.optional(),
    authors: z.array(AuthorSchema).min(1),
    identifiers: z.array(ExternalIdentifierSchema),
    publicationDate: IsoDateSchema.optional(),
    venue: NonEmptyStringSchema.optional(),
    publicationKind: z.enum([
      "preprint",
      "journal-article",
      "conference-paper",
      "other",
    ]),
    landingUrl: UrlSchema,
    pdfUrl: UrlSchema.optional(),
    sourceRecords: z.array(SourceRecordReferenceSchema).min(1),
    firstSeenAt: IsoDateTimeSchema,
    lastSeenAt: IsoDateTimeSchema,
    identity: z
      .object({
        canonicalKey: NonEmptyStringSchema,
        matchedBy: z
          .array(
            z.enum(["doi", "preprint-id", "pmid", "title-authors", "manual"]),
          )
          .min(1),
      })
      .strict(),
  })
  .strict();
export type Paper = z.infer<typeof PaperSchema>;

export const CandidatePaperSchema = PaperSchema.extend({
  abstract: NonEmptyStringSchema,
});
export type CandidatePaper = z.infer<typeof CandidatePaperSchema>;

export const RelevanceAssessmentSchema = z
  .object({
    score: z.number().min(0).max(1),
    lexicalScore: z.number().min(0).max(1),
    semanticScore: z.number().min(0).max(1).optional(),
    classifierScore: z.number().min(0).max(1).optional(),
    matchedKeywords: z.array(NonEmptyStringSchema),
    excludedKeywords: z.array(NonEmptyStringSchema),
    reasons: z.array(NonEmptyStringSchema).min(1),
    assessedAt: IsoDateTimeSchema,
    rulesetVersion: NonEmptyStringSchema,
    model: z
      .object({
        provider: NonEmptyStringSchema,
        model: NonEmptyStringSchema,
        promptVersion: NonEmptyStringSchema,
      })
      .strict()
      .optional(),
  })
  .strict();
export type RelevanceAssessment = z.infer<typeof RelevanceAssessmentSchema>;

export const CandidateSchema = z
  .object({
    schemaVersion: ContractVersionSchema,
    id: NonEmptyStringSchema,
    revision: z.number().int().positive(),
    paper: CandidatePaperSchema,
    topics: z.array(TopicSchema).min(1),
    relevance: RelevanceAssessmentSchema,
    discoveredAt: IsoDateTimeSchema,
    discoveryRunId: NonEmptyStringSchema,
    status: z.enum(["awaiting-triage", "deferred"]),
    eligibleAfter: IsoDateTimeSchema.optional(),
    recordSha256: Sha256Schema,
  })
  .strict()
  .superRefine((candidate, context) => {
    if (
      candidate.status === "deferred" &&
      candidate.eligibleAfter === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "A deferred candidate must specify eligibleAfter",
        path: ["eligibleAfter"],
      });
    }
    if (
      candidate.status === "awaiting-triage" &&
      candidate.eligibleAfter !== undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "An awaiting-triage candidate cannot specify eligibleAfter",
        path: ["eligibleAfter"],
      });
    }
  });
export type Candidate = z.infer<typeof CandidateSchema>;
