import YAML from "yaml";
import {
  PublicPaperFrontmatterSchema,
  PublishedPaperSchema,
  type DraftDecision,
  type DraftSummary,
  type Paper,
  type PublishedPaper,
  type PublicPaperFrontmatter,
} from "@deepgeno/contracts";
import { sha256, slugify } from "./util.js";

export type PublicProjection = Readonly<{
  version: "1.0";
  slug: string;
  path: string;
  bytes: Uint8Array;
  sha256: string;
}>;

/**
 * Converts rich private publication state into the sole public artifact.
 * This is deliberately a positive allowlist: nothing reaches Markdown unless
 * it is named in the v2 public frontmatter contract below.
 */
export class PublicDeclassifier {
  declassify(
    publication: PublishedPaper,
    draft: DraftSummary,
  ): PublicProjection {
    const frontmatter = toPublicFrontmatter(publication, draft);
    const markdown = renderFrontmatter(frontmatter);
    return Object.freeze({
      version: "1.0" as const,
      slug: frontmatter.slug,
      path: `content/public/papers/${frontmatter.slug}.md`,
      bytes: new TextEncoder().encode(markdown),
      sha256: sha256(markdown),
    });
  }
}

export function buildPublication(
  paper: Paper,
  draft: DraftSummary,
  approval: DraftDecision & { action: "approve" },
  options: {
    publishedAt: string;
    pullRequestUrl?: string;
    commitSha?: string;
  },
): PublishedPaper {
  const slug = `${slugify(paper.title)}-${sha256(paper.id).slice(0, 7)}`;
  const references = draft.evidence.references.map((reference) => {
    const document = draft.evidence.documents.find(
      (entry) => entry.id === reference.documentId,
    );
    if (!document)
      throw new TypeError(`Unknown evidence document ${reference.documentId}`);
    return {
      id: reference.id,
      documentKind: document.kind,
      sourceUrl: document.sourceUrl,
      locator: reference.locator,
      contentSha256: reference.textSha256,
    };
  });
  return PublishedPaperSchema.parse({
    schemaVersion: "1.0",
    slug,
    paper,
    summary: draft.summary,
    priority: approval.priority,
    progress: approval.progress,
    publishedAt: options.publishedAt,
    updatedAt: options.publishedAt,
    review: {
      draftId: draft.id,
      draftRevision: draft.revision,
      approvedAt: approval.decidedAt,
      approvedBy: approval.decidedBy,
      ...(options.pullRequestUrl
        ? { pullRequestUrl: options.pullRequestUrl }
        : {}),
      ...(options.commitSha ? { commitSha: options.commitSha } : {}),
    },
    evidence: { scope: draft.evidence.scope, references },
  });
}

export function toPublicFrontmatter(
  publication: PublishedPaper,
  draft: DraftSummary,
): PublicPaperFrontmatter {
  const paper = publication.paper;
  const summary = publication.summary;
  const doi = paper.identifiers.find(
    (identifier) => identifier.type === "doi",
  )?.value;
  const evidenceIds = new Map(
    publication.evidence.references.map((reference, index) => [
      reference.id,
      `e${index + 1}`,
    ]),
  );
  const remapEvidenceIds = (ids: string[]) =>
    ids.map((id) => {
      const publicId = evidenceIds.get(id);
      if (!publicId)
        throw new TypeError(`Summary cites unpublished evidence ${id}`);
      return publicId;
    });
  const remapStatement = (statement: typeof summary.coreProblem) => ({
    ...statement,
    evidenceIds: remapEvidenceIds(statement.evidenceIds),
  });

  return PublicPaperFrontmatterSchema.parse({
    schemaVersion: "2.0",
    slug: publication.slug,
    title: paper.title,
    authors: paper.authors.map((author) => author.name),
    ...(paper.publicationDate
      ? { publicationDate: paper.publicationDate }
      : {}),
    publishedAt: publication.publishedAt,
    updatedAt: publication.updatedAt,
    source: paper.sourceRecords[0]!.source,
    ...(paper.venue ? { venue: paper.venue } : {}),
    ...(doi ? { doi } : {}),
    url: paper.landingUrl,
    ...(paper.pdfUrl ? { pdfUrl: paper.pdfUrl } : {}),
    ...(summary.links.code ? { codeUrl: summary.links.code } : {}),
    ...(summary.links.data ? { dataUrl: summary.links.data } : {}),
    ...(summary.links.project ? { projectUrl: summary.links.project } : {}),
    hook: summary.hook,
    priority: publication.priority,
    progress: publication.progress,
    tags: summary.tags,
    topics: summary.topics,
    organisms: summary.organisms,
    modalities: summary.modalities,
    evidence: {
      scope: publication.evidence.scope,
      fullTextAvailable: publication.evidence.scope !== "abstract-only",
      references: publication.evidence.references.map((reference, index) => ({
        id: `e${index + 1}`,
        documentKind: reference.documentKind,
        sourceUrl: reference.sourceUrl,
        locator: reference.locator,
      })),
    },
    coreProblem: remapStatement(summary.coreProblem),
    novelty: summary.novelty.map(remapStatement),
    architecture: {
      ...summary.architecture,
      evidenceIds: remapEvidenceIds(summary.architecture.evidenceIds),
    },
    datasets: summary.data.datasets.map((dataset) => ({
      ...dataset,
      evidenceIds: remapEvidenceIds(dataset.evidenceIds),
    })),
    benchmarks: summary.data.benchmarks.map((benchmark) => ({
      ...benchmark,
      evidenceIds: remapEvidenceIds(benchmark.evidenceIds),
    })),
    results: summary.quantitativeResults.map((result) => ({
      ...result,
      evidenceIds: remapEvidenceIds(result.evidenceIds),
    })),
    takeaways: summary.takeaways.map(remapStatement),
    limitations: summary.limitations.map(remapStatement),
    provenance: {
      generation: {
        provider: draft.generation.provider,
        model: draft.generation.model,
        generatedAt: draft.generation.generatedAt,
        prompt: {
          id: draft.generation.prompt.id,
          version: draft.generation.prompt.version,
        },
        outputSchemaVersion: draft.generation.outputSchemaVersion,
      },
      review: { approvedAt: publication.review.approvedAt },
    },
  });
}

/** Build escaped structured frontmatter; generated prose is never interpreted as MDX/HTML. */
export function renderPublicMarkdown(
  publication: PublishedPaper,
  draft: DraftSummary,
): string {
  const frontmatter = toPublicFrontmatter(publication, draft);
  return renderFrontmatter(frontmatter);
}

function renderFrontmatter(frontmatter: PublicPaperFrontmatter): string {
  const yaml = YAML.stringify(frontmatter, { lineWidth: 0 });
  return `---\n${yaml}---\n\n<!-- Structured page body is rendered by Astro from validated frontmatter. -->\n`;
}
