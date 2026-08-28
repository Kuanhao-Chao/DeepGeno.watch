import { z } from "zod";

import {
  AppConfigSchema,
  CandidateBatchSchema,
  CheckpointSchema,
} from "./operations.js";
import { CandidateSchema, PaperSchema } from "./paper.js";
import {
  PublishedPaperSchema,
  PublicPaperDocumentSchema,
} from "./publication.js";
import { SourceRecordSchema } from "./source.js";
import { DraftSummarySchema, TechnicalSummarySchema } from "./summary.js";

export const toContractJsonSchema = (
  schema: z.ZodType,
): Record<string, unknown> =>
  z.toJSONSchema(schema, {
    target: "draft-2020-12",
    unrepresentable: "throw",
  }) as Record<string, unknown>;

export const contractJsonSchemas = {
  appConfig: () => toContractJsonSchema(AppConfigSchema),
  candidate: () => toContractJsonSchema(CandidateSchema),
  candidateBatch: () => toContractJsonSchema(CandidateBatchSchema),
  checkpoint: () => toContractJsonSchema(CheckpointSchema),
  draftSummary: () => toContractJsonSchema(DraftSummarySchema),
  paper: () => toContractJsonSchema(PaperSchema),
  publicPaperDocument: () => toContractJsonSchema(PublicPaperDocumentSchema),
  publishedPaper: () => toContractJsonSchema(PublishedPaperSchema),
  sourceRecord: () => toContractJsonSchema(SourceRecordSchema),
  technicalSummary: () => toContractJsonSchema(TechnicalSummarySchema),
} as const;
