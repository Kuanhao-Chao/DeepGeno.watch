import type { Enrichment, SourceDocument } from "./ports.js";
import { canonicalDoi, compactText, sha256, uniqueStrings } from "./util.js";

export interface NormalizedPaper {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  publishedAt: string;
  updatedAt?: string;
  doi?: string;
  url: string;
  journal?: string;
  affiliations: string[];
  categories: string[];
  tags: string[];
  score: number;
  matchedTerms: string[];
  sourceRecords: SourceDocument[];
  enrichment: Enrichment;
}

export interface RelevancePolicy {
  topicTerms?: Readonly<Record<string, readonly string[]>>;
  architectureSignals?: readonly string[];
  genomicsSignals?: readonly string[];
  negativeSignals?: readonly string[];
}

const TOPICS = {
  "sequence-to-function": [
    "sequence-to-function",
    "sequence to function",
    "genomic sequence",
    "regulatory sequence",
    "promoter",
    "enhancer",
    "cis-regulatory",
    "gene expression prediction",
  ],
  "dna-language-model": [
    "genomic language model",
    "dna language model",
    "foundation model",
    "masked language model",
    "nucleotide transformer",
  ],
  "rna-language-model": [
    "rna language model",
    "rna foundation model",
    "transcriptome foundation model",
  ],
  "protein-language-model": [
    "protein language model",
    "protein foundation model",
    "protein sequence model",
  ],
  "variant-effect-prediction": [
    "variant effect",
    "variant pathogenicity",
    "missense",
    "noncoding variant",
    "zero-shot variant",
  ],
  "gene-regulation": [
    "gene regulation",
    "regulatory genomics",
    "epigenomic",
    "chromatin",
    "transcription factor",
    "accessibility",
  ],
  "single-cell-deep-learning": [
    "single-cell",
    "single cell",
    "scrna-seq",
    "scatac-seq",
    "spatial transcriptomics",
  ],
  "structural-bioinformatics": [
    "protein structure",
    "rna structure",
    "structure prediction",
    "protein design",
    "molecular structure",
  ],
} as const;

const ARCHITECTURE_SIGNALS = [
  "deep learning",
  "transformer",
  "neural network",
  "attention",
  "state space model",
  "foundation model",
] as const;

const GENOMICS_SIGNALS = [
  "dna",
  "rna",
  "genome",
  "genomic",
  "protein",
  "epigenomic",
  "chromatin",
  "variant",
  "sequence",
] as const;

const NEGATIVE_TERMS = [
  "genetic algorithm",
  "dna storage",
  "wireless",
  "network intrusion",
  "image classification",
] as const;

export function normalizeAndRank(
  records: readonly SourceDocument[],
  enrichments: ReadonlyMap<string, Enrichment> = new Map(),
  policy: RelevancePolicy = {},
): NormalizedPaper[] {
  const groups = deduplicate(records);
  return groups
    .map((group) => normalizeGroup(group, enrichments, policy))
    .filter((paper): paper is NormalizedPaper => paper !== undefined)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.publishedAt.localeCompare(left.publishedAt) ||
        left.id.localeCompare(right.id),
    );
}

export function hasCompleteAbstract(abstract: string): boolean {
  const text = compactText(abstract);
  if (text.length < 120 || text.split(/\s+/).length < 20) return false;
  if (/^(?:no abstract|abstract unavailable|not available)\.?$/i.test(text))
    return false;
  return !/(?:\.\.\.|…|\[truncated\])$/i.test(text);
}

function deduplicate(records: readonly SourceDocument[]): SourceDocument[][] {
  const groups = new Map<string, SourceDocument[]>();
  const titleToKey = new Map<string, string>();
  for (const input of records) {
    const record = sanitizeRecord(input);
    const doi = canonicalDoi(record.doi);
    const doiKey = doi ? `doi:${doi}` : undefined;
    const titleKey = titleFingerprint(record.title);
    const existingKey =
      (doiKey && groups.has(doiKey) ? doiKey : undefined) ??
      titleToKey.get(titleKey);
    const key = existingKey ?? doiKey ?? `title:${titleKey}`;
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
    titleToKey.set(titleKey, key);
  }
  return [...groups.values()];
}

function normalizeGroup(
  sourceRecords: SourceDocument[],
  enrichments: ReadonlyMap<string, Enrichment>,
  policy: RelevancePolicy,
): NormalizedPaper | undefined {
  const ordered = [...sourceRecords].sort(compareRecordQuality);
  const primary = ordered[0];
  if (!primary) return undefined;
  const abstract =
    ordered.find((record) => hasCompleteAbstract(record.abstract))?.abstract ??
    primary.abstract;
  if (!hasCompleteAbstract(abstract)) return undefined;
  const authors =
    ordered.find((record) => record.authors.length > 0)?.authors ?? [];
  if (authors.length === 0) return undefined;
  const doi = ordered.map((record) => canonicalDoi(record.doi)).find(Boolean);
  const key = doi ? `doi:${doi}` : `title:${titleFingerprint(primary.title)}`;
  const enrichment = mergeEnrichments(
    ordered
      .map((record) => enrichments.get(recordKey(record)))
      .filter(Boolean) as Enrichment[],
  );
  const relevance = scoreAndTag(
    primary.title,
    abstract,
    ordered.flatMap((record) => record.categories ?? []),
    policy,
  );
  return {
    id: `paper-${sha256(key).slice(0, 16)}`,
    title: primary.title,
    authors,
    abstract,
    publishedAt:
      ordered.map((record) => record.publishedAt).sort()[0] ??
      primary.publishedAt,
    ...(ordered
      .map((record) => record.updatedAt)
      .filter(Boolean)
      .sort()
      .at(-1)
      ? {
          updatedAt: ordered
            .map((record) => record.updatedAt)
            .filter(Boolean)
            .sort()
            .at(-1)!,
        }
      : {}),
    ...(doi ? { doi } : {}),
    url: doi ? `https://doi.org/${doi}` : primary.url,
    ...(ordered.map((record) => record.journal).find(Boolean)
      ? { journal: ordered.map((record) => record.journal).find(Boolean)! }
      : {}),
    affiliations: uniqueStrings([
      ...ordered.flatMap((record) => record.affiliations ?? []),
      ...(enrichment.affiliations ?? []),
    ]),
    categories: uniqueStrings(
      ordered.flatMap((record) => record.categories ?? []),
    ),
    tags: relevance.tags,
    score: relevance.score,
    matchedTerms: relevance.matchedTerms,
    sourceRecords: ordered,
    enrichment,
  };
}

function sanitizeRecord(record: SourceDocument): SourceDocument {
  return {
    ...record,
    title: compactText(record.title),
    authors: record.authors.map(compactText).filter(Boolean),
    abstract: compactText(record.abstract),
    ...(record.affiliations
      ? { affiliations: record.affiliations.map(compactText).filter(Boolean) }
      : {}),
    ...(record.categories
      ? { categories: record.categories.map(compactText).filter(Boolean) }
      : {}),
    ...(canonicalDoi(record.doi) ? { doi: canonicalDoi(record.doi)! } : {}),
  };
}

function compareRecordQuality(
  left: SourceDocument,
  right: SourceDocument,
): number {
  const score = (record: SourceDocument): number =>
    (hasCompleteAbstract(record.abstract) ? 10_000 : 0) +
    record.abstract.length +
    record.authors.length * 10 +
    (record.doi ? 25 : 0);
  return score(right) - score(left) || left.source.localeCompare(right.source);
}

function recordKey(record: SourceDocument): string {
  return `${record.source}:${record.sourceId}`;
}

function titleFingerprint(title: string): string {
  return compactText(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 240);
}

function scoreAndTag(
  title: string,
  abstract: string,
  categories: readonly string[],
  policy: RelevancePolicy,
): {
  score: number;
  tags: string[];
  matchedTerms: string[];
} {
  const normalizedTitle = title.toLowerCase();
  const body = `${title}\n${abstract}\n${categories.join(" ")}`.toLowerCase();
  const tags: string[] = [];
  const matchedTerms: string[] = [];
  let score = 0;
  const topicTerms = { ...TOPICS, ...(policy.topicTerms ?? {}) };
  for (const [tag, terms] of Object.entries(topicTerms)) {
    let matched = false;
    for (const term of terms) {
      if (!body.includes(term)) continue;
      matched = true;
      matchedTerms.push(term);
      score += normalizedTitle.includes(term) ? 4 : 2;
    }
    if (matched) tags.push(tag);
  }
  for (const term of policy.architectureSignals ?? ARCHITECTURE_SIGNALS) {
    if (body.includes(term.toLowerCase())) {
      matchedTerms.push(term);
      score += 1;
    }
  }
  for (const term of policy.genomicsSignals ?? GENOMICS_SIGNALS) {
    if (body.includes(term.toLowerCase())) {
      matchedTerms.push(term);
      score += 1;
    }
  }
  for (const term of policy.negativeSignals ?? NEGATIVE_TERMS) {
    if (body.includes(term.toLowerCase())) score -= 6;
  }
  return {
    score: Math.max(0, Math.min(100, score)),
    tags,
    matchedTerms: uniqueStrings(matchedTerms),
  };
}

function mergeEnrichments(enrichments: readonly Enrichment[]): Enrichment {
  const withFullText = enrichments.find((entry) => entry.fullText);
  const doi = enrichments.map((entry) => entry.doi).find(Boolean);
  return {
    ...(doi ? { doi } : {}),
    affiliations: uniqueStrings(
      enrichments.flatMap((entry) => entry.affiliations ?? []),
    ),
    citationCount: Math.max(
      0,
      ...enrichments.map((entry) => entry.citationCount ?? 0),
    ),
    codeUrls: uniqueStrings(
      enrichments.flatMap((entry) => entry.codeUrls ?? []),
    ),
    dataUrls: uniqueStrings(
      enrichments.flatMap((entry) => entry.dataUrls ?? []),
    ),
    ...(withFullText?.fullText ? { fullText: withFullText.fullText } : {}),
  };
}
