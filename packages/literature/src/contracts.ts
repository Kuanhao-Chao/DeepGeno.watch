import {
  CandidateSchema,
  PaperSchema,
  SourceRecordSchema,
  type Candidate,
  type Paper,
  type SourceRecord,
  type Topic,
} from "@deepgeno/contracts";
import type { NormalizedPaper } from "./processing.js";
import type { SourceDocument } from "./ports.js";
import { canonicalDoi, sha256, stableJson, uniqueStrings } from "./util.js";

export function toSourceRecord(
  record: SourceDocument,
  retrievedAt: string,
): SourceRecord {
  const doi = canonicalDoi(record.doi);
  return SourceRecordSchema.parse({
    schemaVersion: "1.0",
    source: record.source,
    sourceRecordId: record.sourceId,
    ...(record.version ? { sourceVersion: record.version } : {}),
    ...(record.updatedAt
      ? { sourceUpdatedAt: toDateTime(record.updatedAt) }
      : {}),
    title: record.title,
    ...(record.abstract ? { abstract: record.abstract } : {}),
    abstractStatus: record.abstract ? "complete" : "missing",
    authors: record.authors.map((name) => ({ name, affiliations: [] })),
    affiliations: (record.affiliations ?? []).map((name) => ({ name })),
    identifiers: [
      ...(doi ? [{ type: "doi" as const, value: doi }] : []),
      ...(record.source === "arxiv"
        ? [{ type: "arxiv" as const, value: record.sourceId }]
        : []),
      ...(record.source === "biorxiv"
        ? [{ type: "biorxiv" as const, value: record.sourceId }]
        : []),
    ],
    publicationDate: record.publishedAt.slice(0, 10),
    ...(record.journal ? { venue: record.journal } : {}),
    publicationKind:
      record.source === "biorxiv" || record.source === "arxiv"
        ? "preprint"
        : "journal-article",
    landingUrl: record.url,
    ...(record.pdfUrl ? { pdfUrl: record.pdfUrl } : {}),
    ...(record.license ? { license: record.license } : {}),
    provenance: {
      url: record.url,
      retrievedAt,
      mediaType: "application/json",
      contentSha256: sha256(stableJson(record)),
      httpStatus: 200,
    },
  });
}

export function toPaper(
  normalized: NormalizedPaper,
  retrievedAt: string,
): Paper {
  const identifiers = uniqueStrings(
    normalized.sourceRecords.map((record) => canonicalDoi(record.doi)),
  ).map((value) => ({
    type: "doi" as const,
    value,
  }));
  for (const record of normalized.sourceRecords) {
    if (record.source === "arxiv")
      identifiers.push({ type: "arxiv" as never, value: record.sourceId });
    if (record.source === "biorxiv")
      identifiers.push({ type: "biorxiv" as never, value: record.sourceId });
  }
  return PaperSchema.parse({
    schemaVersion: "1.0",
    id: normalized.id,
    title: normalized.title,
    abstract: normalized.abstract,
    authors: normalized.authors.map((name) => ({ name, affiliations: [] })),
    identifiers,
    publicationDate: normalized.publishedAt.slice(0, 10),
    ...(normalized.journal ? { venue: normalized.journal } : {}),
    publicationKind: normalized.sourceRecords.every(
      (record) => record.source === "arxiv" || record.source === "biorxiv",
    )
      ? "preprint"
      : "journal-article",
    landingUrl: normalized.url,
    ...(normalized.sourceRecords.map((record) => record.pdfUrl).find(Boolean)
      ? {
          pdfUrl: normalized.sourceRecords
            .map((record) => record.pdfUrl)
            .find(Boolean)!,
        }
      : {}),
    sourceRecords: normalized.sourceRecords.map((record) => ({
      source: record.source,
      sourceRecordId: record.sourceId,
      ...(record.version ? { sourceVersion: record.version } : {}),
      landingUrl: record.url,
      retrievedAt,
    })),
    firstSeenAt: retrievedAt,
    lastSeenAt: retrievedAt,
    identity: {
      canonicalKey: normalized.doi ? `doi:${normalized.doi}` : normalized.id,
      matchedBy: normalized.doi ? ["doi"] : ["title-authors"],
    },
  });
}

export function toCandidate(
  normalized: NormalizedPaper,
  paper: Paper,
  runId: string,
  discoveredAt: string,
  revision = 1,
): Candidate {
  const topics = topicValues(normalized.tags);
  const core = {
    schemaVersion: "1.0" as const,
    id: `candidate-${paper.id}`,
    revision,
    paper: { ...paper, abstract: normalized.abstract },
    topics,
    relevance: {
      score: Math.min(1, normalized.score / 20),
      lexicalScore: Math.min(1, normalized.score / 20),
      matchedKeywords: normalized.matchedTerms,
      excludedKeywords: [],
      reasons: topics.map((topic) => `Matched ${topic}`),
      assessedAt: discoveredAt,
      rulesetVersion: "lexical-v1",
    },
    discoveredAt,
    discoveryRunId: runId,
    status: "awaiting-triage" as const,
  };
  return CandidateSchema.parse({
    ...core,
    recordSha256: sha256(stableJson(core)),
  });
}

function topicValues(tags: string[]): Topic[] {
  const mapped = tags.flatMap<Topic>((tag) => {
    switch (tag) {
      case "sequence-to-function":
        return ["sequence-to-function"];
      case "dna-language-model":
        return ["dna-language-model"];
      case "rna-language-model":
        return ["rna-language-model"];
      case "protein-language-model":
        return ["protein-language-model"];
      case "variant-effect-prediction":
        return ["variant-effect-prediction"];
      case "gene-regulation":
        return ["gene-regulation"];
      case "epigenomics":
        return ["epigenomics"];
      case "single-cell-deep-learning":
        return ["single-cell-deep-learning"];
      case "structural-bioinformatics":
        return ["structural-bioinformatics"];
      default:
        return [];
    }
  });
  return mapped.length ? [...new Set(mapped)] : ["sequence-to-function"];
}

function toDateTime(value: string): string {
  return value.includes("T")
    ? new Date(value).toISOString()
    : new Date(`${value}T00:00:00.000Z`).toISOString();
}
