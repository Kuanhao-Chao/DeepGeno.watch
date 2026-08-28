import { getPapers, paperDate, paperHref, paperSlug } from "../lib/papers";

export async function GET() {
  const papers = await getPapers();
  const body = {
    schemaVersion: "1.0",
    papers: papers.map((paper) => ({
      id: paper.data.paperId,
      slug: paperSlug(paper),
      path: paperHref(paper),
      title: paper.data.title,
      authors: paper.data.authors,
      publicationDate: paperDate(paper).toISOString(),
      source: paper.data.source,
      venue: paper.data.venue,
      doi: paper.data.doi,
      url: paper.data.url,
      hook: paper.data.hook,
      priority: paper.data.priority,
      progress: paper.data.progress,
      topics: paper.data.topics,
      tags: paper.data.tags,
      organisms: paper.data.organisms,
      modalities: paper.data.modalities,
      evidence: {
        scope: paper.data.evidence.scope,
        fullTextAvailable: paper.data.evidence.fullTextAvailable,
      },
      updatedAt: paper.data.updatedAt.toISOString(),
    })),
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
