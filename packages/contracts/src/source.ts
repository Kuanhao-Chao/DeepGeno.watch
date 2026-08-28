import { z } from "zod";

import {
  ContractVersionSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  Sha256Schema,
  UrlSchema,
} from "./primitives.js";

export const SourceNameValues = [
  "biorxiv",
  "arxiv",
  "crossref",
  "europe-pmc",
  "openalex",
] as const;
export const SourceNameSchema = z.enum(SourceNameValues);
export type SourceName = z.infer<typeof SourceNameSchema>;

export const ExternalIdentifierTypeValues = [
  "doi",
  "arxiv",
  "biorxiv",
  "pmid",
  "pmcid",
  "openalex",
] as const;
export const ExternalIdentifierTypeSchema = z.enum(
  ExternalIdentifierTypeValues,
);
export type ExternalIdentifierType = z.infer<
  typeof ExternalIdentifierTypeSchema
>;

export const ExternalIdentifierSchema = z
  .object({
    type: ExternalIdentifierTypeSchema,
    value: NonEmptyStringSchema,
  })
  .strict();
export type ExternalIdentifier = z.infer<typeof ExternalIdentifierSchema>;

export const AffiliationSchema = z
  .object({
    name: NonEmptyStringSchema,
    rorId: NonEmptyStringSchema.optional(),
    countryCode: z.string().length(2).toUpperCase().optional(),
  })
  .strict();
export type Affiliation = z.infer<typeof AffiliationSchema>;

export const AuthorSchema = z
  .object({
    name: NonEmptyStringSchema,
    orcid: z
      .string()
      .regex(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/)
      .optional(),
    affiliations: z.array(AffiliationSchema),
  })
  .strict();
export type Author = z.infer<typeof AuthorSchema>;

export const ResourceProvenanceSchema = z
  .object({
    url: UrlSchema,
    retrievedAt: IsoDateTimeSchema,
    mediaType: NonEmptyStringSchema.optional(),
    etag: NonEmptyStringSchema.optional(),
    lastModified: NonEmptyStringSchema.optional(),
    contentSha256: Sha256Schema.optional(),
    httpStatus: z.number().int().min(100).max(599).optional(),
  })
  .strict();
export type ResourceProvenance = z.infer<typeof ResourceProvenanceSchema>;

export const SourceRecordSchema = z
  .object({
    schemaVersion: ContractVersionSchema,
    source: SourceNameSchema,
    sourceRecordId: NonEmptyStringSchema,
    sourceVersion: NonEmptyStringSchema.optional(),
    sourceUpdatedAt: IsoDateTimeSchema.optional(),
    title: NonEmptyStringSchema,
    abstract: NonEmptyStringSchema.optional(),
    abstractStatus: z.enum(["complete", "truncated", "missing"]),
    authors: z.array(AuthorSchema),
    affiliations: z.array(AffiliationSchema),
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
    fullTextUrl: UrlSchema.optional(),
    license: NonEmptyStringSchema.optional(),
    provenance: ResourceProvenanceSchema,
  })
  .strict();
export type SourceRecord = z.infer<typeof SourceRecordSchema>;

export const SourceRecordReferenceSchema = z
  .object({
    source: SourceNameSchema,
    sourceRecordId: NonEmptyStringSchema,
    sourceVersion: NonEmptyStringSchema.optional(),
    landingUrl: UrlSchema,
    retrievedAt: IsoDateTimeSchema,
  })
  .strict();
export type SourceRecordReference = z.infer<typeof SourceRecordReferenceSchema>;
