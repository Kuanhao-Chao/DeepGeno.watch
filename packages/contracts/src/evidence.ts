import { z } from "zod";

import {
  ContractVersionSchema,
  EvidenceScopeSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  Sha256Schema,
  UrlSchema,
} from "./primitives.js";

export const EvidenceDocumentSchema = z
  .object({
    id: NonEmptyStringSchema,
    kind: z.enum(["abstract", "jats", "html", "pdf", "supplement"]),
    title: NonEmptyStringSchema,
    sourceUrl: UrlSchema,
    retrievedAt: IsoDateTimeSchema,
    mediaType: NonEmptyStringSchema,
    license: NonEmptyStringSchema.optional(),
    access: z.enum(["open", "abstract-access", "unknown"]),
    contentSha256: Sha256Schema,
  })
  .strict();
export type EvidenceDocument = z.infer<typeof EvidenceDocumentSchema>;

export const EvidenceLocatorSchema = z
  .object({
    section: NonEmptyStringSchema.optional(),
    paragraph: z.number().int().positive().optional(),
    page: z.number().int().positive().optional(),
    figure: NonEmptyStringSchema.optional(),
    table: NonEmptyStringSchema.optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "An evidence locator cannot be empty",
  );
export type EvidenceLocator = z.infer<typeof EvidenceLocatorSchema>;

export const EvidenceReferenceSchema = z
  .object({
    id: NonEmptyStringSchema,
    documentId: NonEmptyStringSchema,
    kind: z.enum(["abstract", "body", "caption", "table", "metadata"]),
    locator: EvidenceLocatorSchema,
    text: NonEmptyStringSchema,
    textSha256: Sha256Schema,
  })
  .strict();
export type EvidenceReference = z.infer<typeof EvidenceReferenceSchema>;

export const EvidencePacketSchema = z
  .object({
    schemaVersion: ContractVersionSchema,
    id: NonEmptyStringSchema,
    paperId: NonEmptyStringSchema,
    scope: EvidenceScopeSchema,
    documents: z.array(EvidenceDocumentSchema).min(1),
    references: z.array(EvidenceReferenceSchema).min(1),
    assembledAt: IsoDateTimeSchema,
    assemblerVersion: NonEmptyStringSchema,
    inputSha256: Sha256Schema,
    warnings: z.array(NonEmptyStringSchema),
  })
  .strict()
  .superRefine((packet, context) => {
    const documentIds = new Set(
      packet.documents.map((document) => document.id),
    );
    const referenceIds = new Set<string>();

    packet.references.forEach((reference, index) => {
      if (!documentIds.has(reference.documentId)) {
        context.addIssue({
          code: "custom",
          message: `Unknown evidence document: ${reference.documentId}`,
          path: ["references", index, "documentId"],
        });
      }
      if (referenceIds.has(reference.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate evidence reference: ${reference.id}`,
          path: ["references", index, "id"],
        });
      }
      referenceIds.add(reference.id);
    });
  });
export type EvidencePacket = z.infer<typeof EvidencePacketSchema>;

export const PublishedEvidenceReferenceSchema = z
  .object({
    id: NonEmptyStringSchema,
    documentKind: EvidenceDocumentSchema.shape.kind,
    sourceUrl: UrlSchema,
    locator: EvidenceLocatorSchema,
    contentSha256: Sha256Schema,
  })
  .strict();
export type PublishedEvidenceReference = z.infer<
  typeof PublishedEvidenceReferenceSchema
>;
