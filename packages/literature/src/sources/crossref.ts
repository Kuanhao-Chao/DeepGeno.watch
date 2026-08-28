import { AllowlistedHttpClient } from "../http.js";
import type {
  LiteratureSource,
  SourceDocument,
  SourceFetchRequest,
  SourceFetchResult,
} from "../ports.js";
import { compactText } from "../util.js";

interface CrossrefItem {
  DOI?: string;
  title?: string[];
  abstract?: string;
  author?: Array<{
    given?: string;
    family?: string;
    affiliation?: Array<{ name?: string }>;
  }>;
  URL?: string;
  published?: { "date-parts"?: number[][] };
  indexed?: { "date-time"?: string };
  "container-title"?: string[];
  subject?: string[];
  license?: Array<{ URL?: string }>;
}

interface CrossrefResponse {
  message?: { items?: CrossrefItem[]; "next-cursor"?: string };
}

export interface CrossrefSourceOptions {
  issn: string;
  journal: string;
  mailto?: string;
  maxPages?: number;
  rows?: number;
  overlapDays?: number;
  baseUrl?: string;
}

export class CrossrefIssnSource implements LiteratureSource {
  readonly source = "crossref" as const;
  readonly name: string;
  readonly overlapDays: number;
  readonly #http: AllowlistedHttpClient;
  readonly #options: CrossrefSourceOptions;
  readonly #baseUrl: URL;

  constructor(http: AllowlistedHttpClient, options: CrossrefSourceOptions) {
    this.#http = http;
    this.#options = options;
    this.name = `crossref-${options.issn}`;
    this.overlapDays = options.overlapDays ?? 0;
    this.#baseUrl = new URL(options.baseUrl ?? "https://api.crossref.org");
  }

  async fetch(request: SourceFetchRequest): Promise<SourceFetchResult> {
    let cursor = request.cursor ?? "*";
    const records: SourceDocument[] = [];
    for (let page = 0; page < (this.#options.maxPages ?? 25); page += 1) {
      const url = new URL(
        `/journals/${encodeURIComponent(this.#options.issn)}/works`,
        this.#baseUrl,
      );
      url.searchParams.set(
        "filter",
        `from-created-date:${request.from},until-created-date:${request.to}`,
      );
      url.searchParams.set(
        "select",
        "DOI,title,abstract,author,URL,published,indexed,container-title,subject,license",
      );
      url.searchParams.set("rows", String(this.#options.rows ?? 100));
      url.searchParams.set("cursor", cursor);
      if (this.#options.mailto)
        url.searchParams.set("mailto", this.#options.mailto);
      const response = await this.#http.getJson<CrossrefResponse>(url);
      const items = response.message?.items ?? [];
      records.push(
        ...items
          .map((item) => toDocument(item, this.#options.journal))
          .filter(isDocument),
      );
      const next = response.message?.["next-cursor"];
      if (!next || next === cursor || items.length === 0) return { records };
      cursor = next;
    }
    return { records, cursor };
  }
}

function toDocument(
  item: CrossrefItem,
  journal: string,
): SourceDocument | undefined {
  const doi = item.DOI;
  const title = item.title?.[0];
  if (!doi || !title) return undefined;
  const dateParts = item.published?.["date-parts"]?.[0] ?? [];
  const [year, month = 1, day = 1] = dateParts;
  const publishedAt = year
    ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : item.indexed?.["date-time"];
  if (!publishedAt) return undefined;
  const affiliations =
    item.author?.flatMap(
      (author) =>
        (author.affiliation
          ?.map((entry) => entry.name)
          .filter(Boolean) as string[]) ?? [],
    ) ?? [];
  return {
    source: "crossref",
    sourceId: doi,
    title: compactText(title),
    authors:
      item.author
        ?.map((author) =>
          compactText([author.given, author.family].filter(Boolean).join(" ")),
        )
        .filter(Boolean) ?? [],
    abstract: stripMarkup(item.abstract ?? ""),
    publishedAt,
    ...(item.indexed?.["date-time"]
      ? { updatedAt: item.indexed["date-time"] }
      : {}),
    url: item.URL ?? `https://doi.org/${doi}`,
    doi,
    ...(affiliations.length ? { affiliations } : {}),
    ...(item.subject?.length
      ? { categories: item.subject.map(compactText) }
      : {}),
    journal: item["container-title"]?.[0] ?? journal,
    ...(item.license?.[0]?.URL ? { license: item.license[0].URL } : {}),
  };
}

function stripMarkup(value: string): string {
  return compactText(value.replace(/<[^>]+>/g, " "));
}

function isDocument(
  value: SourceDocument | undefined,
): value is SourceDocument {
  return value !== undefined;
}
