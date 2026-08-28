import { compactText } from "../util.js";
import type {
  LiteratureSource,
  SourceDocument,
  SourceFetchRequest,
  SourceFetchResult,
} from "../ports.js";
import { AllowlistedHttpClient } from "../http.js";

interface BioRxivItem {
  doi: string;
  title: string;
  authors: string;
  abstract: string;
  date: string;
  version?: string;
  category?: string;
  license?: string;
  author_corresponding_institution?: string;
  published?: string;
  server?: string;
}

interface BioRxivResponse {
  messages?: Array<{
    status?: string;
    cursor?: number;
    count?: number;
    total?: number;
  }>;
  collection?: BioRxivItem[];
}

export class BioRxivSource implements LiteratureSource {
  readonly name = "biorxiv";
  readonly source = "biorxiv" as const;
  readonly overlapDays: number;
  readonly #http: AllowlistedHttpClient;
  readonly #maxPages: number;
  readonly #baseUrl: URL;

  constructor(
    http: AllowlistedHttpClient,
    options: {
      maxPages?: number;
      overlapDays?: number;
      baseUrl?: string;
    } = {},
  ) {
    this.#http = http;
    this.#maxPages = options.maxPages ?? 100;
    this.overlapDays = options.overlapDays ?? 0;
    this.#baseUrl = new URL(options.baseUrl ?? "https://api.biorxiv.org");
  }

  async fetch(request: SourceFetchRequest): Promise<SourceFetchResult> {
    let cursor = Number(request.cursor ?? 0);
    const records: SourceDocument[] = [];
    for (let page = 0; page < this.#maxPages; page += 1) {
      const url = new URL(
        `/details/biorxiv/${encodeURIComponent(request.from)}/${encodeURIComponent(request.to)}/${cursor}`,
        this.#baseUrl,
      );
      const response = await this.#http.getJson<BioRxivResponse>(url);
      const items = response.collection ?? [];
      records.push(...items.map(toSourceDocument));
      const message = response.messages?.[0];
      const count = message?.count ?? items.length;
      const total = message?.total ?? cursor + count;
      cursor += count;
      if (count === 0 || cursor >= total) {
        return { records };
      }
    }
    return { records, cursor: String(cursor) };
  }
}

function toSourceDocument(item: BioRxivItem): SourceDocument {
  const institution = compactText(item.author_corresponding_institution ?? "");
  return {
    source: "biorxiv",
    sourceId: item.doi,
    title: compactText(item.title),
    authors: item.authors.split(";").map(compactText).filter(Boolean),
    abstract: compactText(item.abstract),
    publishedAt: item.date,
    url: `https://doi.org/${item.doi}`,
    pdfUrl: `https://www.biorxiv.org/content/${item.doi}${item.version ? `v${item.version}` : ""}.full.pdf`,
    doi: item.doi,
    ...(institution ? { affiliations: [institution] } : {}),
    ...(item.category ? { categories: [compactText(item.category)] } : {}),
    ...(item.license ? { license: item.license } : {}),
    ...(item.version ? { version: item.version } : {}),
    metadata: { publishedDoi: item.published, server: item.server },
  };
}
