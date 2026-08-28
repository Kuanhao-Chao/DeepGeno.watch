import { getCollection, type CollectionEntry } from "astro:content";

export type PaperEntry = CollectionEntry<"papers">;
export type PaperData = PaperEntry["data"];

const priorityOrder: Record<PaperData["priority"], number> = {
  "must-read": 0,
  recommended: 1,
  notable: 2,
};

export async function getPapers(): Promise<PaperEntry[]> {
  const papers = await getCollection("papers");
  return papers.toSorted(
    (left, right) => paperDate(right).getTime() - paperDate(left).getTime(),
  );
}

export function paperDate(paper: PaperEntry): Date {
  return paper.data.publicationDate ?? paper.data.publishedAt;
}

export function paperSlug(paper: PaperEntry): string {
  return paper.data.slug ?? paper.id.replace(/\.md$/i, "");
}

export function paperHref(paper: PaperEntry): string {
  return `/papers/${encodeURIComponent(paperSlug(paper))}/`;
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatAuthors(authors: string[], compact = false): string {
  if (!compact || authors.length <= 3) return authors.join(", ");
  return `${authors.slice(0, 2).join(", ")} et al.`;
}

export function titleCase(value: string): string {
  return value
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function evidenceLabel(scope: PaperData["evidence"]["scope"]): string {
  switch (scope) {
    case "full-text":
      return "Full-text evidence";
    case "partial-full-text":
      return "Mixed evidence";
    case "abstract-only":
      return "Abstract evidence";
  }
}

export function priorityRank(priority: PaperData["priority"]): number {
  return priorityOrder[priority];
}

export function uniqueValues(
  papers: PaperEntry[],
  field: "tags" | "organisms" | "modalities",
) {
  return [...new Set(papers.flatMap((paper) => paper.data[field]))].toSorted(
    (a, b) => a.localeCompare(b),
  );
}
