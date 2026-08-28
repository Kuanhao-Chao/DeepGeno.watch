import { AllowlistedHttpClient } from "../http.js";
import type {
  LiteratureSource,
  SourceDocument,
  SourceFetchRequest,
  SourceFetchResult,
} from "../ports.js";
import { compactText, uniqueStrings } from "../util.js";

interface EuropePmcCoreResult {
  id?: string;
  source?: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title?: string;
  abstractText?: string;
  authorString?: string;
  authorList?: { author?: Array<{ fullName?: string }> };
  affiliation?: string;
  affiliationList?: { affiliation?: Array<{ affiliation?: string }> };
  journalTitle?: string;
  firstPublicationDate?: string;
  electronicPublicationDate?: string;
  journalInfo?: { printPublicationDate?: string };
  pubTypeList?: { pubType?: string[] };
  isOpenAccess?: string;
  citedByCount?: number;
}

interface EuropePmcCoreResponse {
  hitCount?: number;
  nextCursorMark?: string;
  resultList?: { result?: EuropePmcCoreResult[] };
}

export interface EuropePmcSearchSourceOptions {
  journals: readonly string[];
  overlapDays?: number;
  pageSize?: number;
  maxPages?: number;
  baseUrl?: string;
}

/** Journal discovery with core metadata so Gate 1 can require a complete abstract. */
export class EuropePmcSearchSource implements LiteratureSource {
  readonly name = "europe-pmc-journals";
  readonly source = "europe-pmc" as const;
  readonly overlapDays: number;
  readonly #http: AllowlistedHttpClient;
  readonly #journals: readonly string[];
  readonly #pageSize: number;
  readonly #maxPages: number;
  readonly #baseUrl: URL;

  constructor(
    http: AllowlistedHttpClient,
    options: EuropePmcSearchSourceOptions,
  ) {
    this.#http = http;
    this.#journals = options.journals;
    this.overlapDays = options.overlapDays ?? 0;
    this.#pageSize = options.pageSize ?? 100;
    this.#maxPages = options.maxPages ?? 25;
    const configured =
      options.baseUrl ?? "https://www.ebi.ac.uk/europepmc/webservices/rest/";
    this.#baseUrl = new URL(
      configured.endsWith("/") ? configured : `${configured}/`,
    );
  }

  async fetch(request: SourceFetchRequest): Promise<SourceFetchResult> {
    let cursor = request.cursor ?? "*";
    const records: SourceDocument[] = [];
    const journals = this.#journals
      .map((journal) => `JOURNAL:"${escapeQueryPhrase(journal)}"`)
      .join(" OR ");
    const query = `FIRST_PDATE:[${request.from} TO ${request.to}] AND (${journals})`;

    for (let page = 0; page < this.#maxPages; page += 1) {
      const url = new URL("search", this.#baseUrl);
      url.searchParams.set("query", query);
      url.searchParams.set("resultType", "core");
      url.searchParams.set("format", "json");
      url.searchParams.set("pageSize", String(this.#pageSize));
      url.searchParams.set("cursorMark", cursor);
      const response = await this.#http.getJson<EuropePmcCoreResponse>(url);
      const items = response.resultList?.result ?? [];
      records.push(...items.map(toDocument).filter(isDocument));
      const next = response.nextCursorMark;
      if (!next || next === cursor || items.length === 0) return { records };
      cursor = next;
    }
    return { records, cursor };
  }
}

function toDocument(item: EuropePmcCoreResult): SourceDocument | undefined {
  const id = item.id ?? item.pmid ?? item.pmcid;
  const title = compactText(item.title ?? "");
  const publishedAt =
    item.firstPublicationDate ??
    item.electronicPublicationDate ??
    item.journalInfo?.printPublicationDate;
  if (!id || !title || !publishedAt) return undefined;
  const listedAuthors =
    item.authorList?.author
      ?.map((author) => compactText(author.fullName ?? ""))
      .filter(Boolean) ?? [];
  const authors = listedAuthors.length
    ? listedAuthors
    : (item.authorString ?? "").split(/,\s*/).map(compactText).filter(Boolean);
  const affiliations = uniqueStrings([
    item.affiliation,
    ...(item.affiliationList?.affiliation?.map((entry) =>
      compactText(entry.affiliation ?? ""),
    ) ?? []),
  ]);
  const source = item.source ?? (item.pmcid ? "PMC" : "MED");
  return {
    source: "europe-pmc",
    sourceId: id,
    title,
    authors,
    abstract: compactText(item.abstractText ?? ""),
    publishedAt: publishedAt.slice(0, 10),
    url: `https://europepmc.org/article/${encodeURIComponent(source)}/${encodeURIComponent(id)}`,
    ...(item.doi ? { doi: item.doi } : {}),
    ...(affiliations.length ? { affiliations } : {}),
    ...(item.pubTypeList?.pubType?.length
      ? { categories: item.pubTypeList.pubType.map(compactText) }
      : {}),
    ...(item.journalTitle ? { journal: compactText(item.journalTitle) } : {}),
    metadata: {
      pmcid: item.pmcid,
      isOpenAccess: item.isOpenAccess,
      citedByCount: item.citedByCount,
    },
  };
}

function escapeQueryPhrase(value: string): string {
  return value.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
}

function isDocument(
  value: SourceDocument | undefined,
): value is SourceDocument {
  return value !== undefined;
}
