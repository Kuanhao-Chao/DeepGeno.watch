import type { TechnicalSummary } from "@deepgeno/contracts";
import type { z } from "zod";

export type SourceKind =
  "biorxiv" | "arxiv" | "crossref" | "europe-pmc" | "openalex";

export interface SourceDocument {
  source: SourceKind;
  sourceId: string;
  title: string;
  authors: string[];
  abstract: string;
  publishedAt: string;
  updatedAt?: string;
  url: string;
  pdfUrl?: string;
  doi?: string;
  affiliations?: string[];
  categories?: string[];
  journal?: string;
  license?: string;
  version?: string;
  metadata?: Record<string, unknown>;
}

export interface SourceFetchRequest {
  from: string;
  to: string;
  cursor?: string;
}

export interface SourceFetchResult {
  records: SourceDocument[];
  cursor?: string;
}

export interface LiteratureSource {
  readonly name: string;
  readonly source: SourceKind;
  readonly overlapDays?: number;
  fetch(request: SourceFetchRequest): Promise<SourceFetchResult>;
}

export interface Enrichment {
  doi?: string;
  affiliations?: string[];
  citationCount?: number;
  codeUrls?: string[];
  dataUrls?: string[];
  fullText?: {
    format: "jats" | "plain";
    content: string;
    license?: string;
    sourceUrl: string;
  };
}

export interface MetadataEnricher {
  readonly name: string;
  enrich(record: SourceDocument): Promise<Enrichment | undefined>;
}

export interface StructuredModelRequest {
  system: string;
  prompt: string;
  schemaName: string;
  outputSchema: z.ZodType;
  idempotencyKey?: string;
}

export interface StructuredModelResponse {
  value: unknown;
  provider: "openai" | "anthropic" | "cloudflare-workers-ai" | "fake";
  model: string;
  responseId?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface StructuredModel {
  readonly provider: StructuredModelResponse["provider"];
  readonly model: string;
  generate(request: StructuredModelRequest): Promise<StructuredModelResponse>;
}

export interface SummaryModelResult {
  summary: TechnicalSummary;
  provider: StructuredModelResponse["provider"];
  model: string;
  responseId?: string;
  usage?: StructuredModelResponse["usage"];
}
