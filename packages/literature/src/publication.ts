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
  const citations = draft.evidence.references.map((reference) => {
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
    evidence: { scope: draft.evidence.scope, citations },
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
  return PublicPaperFrontmatterSchema.parse({
    schemaVersion: "1.0",
    slug: publication.slug,
    paperId: paper.id,
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
      sources: publication.evidence.citations,
    },
    coreProblem: summary.coreProblem,
    novelty: summary.novelty,
    architecture: summary.architecture,
    datasets: summary.data.datasets,
    benchmarks: summary.data.benchmarks,
    results: summary.quantitativeResults,
    takeaways: summary.takeaways,
    limitations: summary.limitations,
    provenance: { generation: draft.generation, review: publication.review },
  });
}

/** Build escaped structured frontmatter; generated prose is never interpreted as MDX/HTML. */
export function renderPublicMarkdown(
  publication: PublishedPaper,
  draft: DraftSummary,
): string {
  const frontmatter = toPublicFrontmatter(publication, draft);
  const yaml = YAML.stringify(frontmatter, { lineWidth: 0 });
  return `---\n${yaml}---\n\n<!-- Structured page body is rendered by Astro from validated frontmatter. -->\n`;
}
