import { XMLParser } from "fast-xml-parser";
import { AllowlistedHttpClient } from "../http.js";
import type {
  LiteratureSource,
  SourceDocument,
  SourceFetchRequest,
  SourceFetchResult,
} from "../ports.js";
import { compactText } from "../util.js";

type UnknownRecord = Record<string, unknown>;

export interface ArxivSourceOptions {
  set?: "q-bio" | "cs" | "stat";
  categoryPrefixes?: readonly string[];
  maxPages?: number;
  requestDelayMs?: number;
  overlapDays?: number;
  baseUrl?: string;
}

export class ArxivOaiSource implements LiteratureSource {
  readonly source = "arxiv" as const;
  readonly name: string;
  readonly overlapDays: number;
  readonly #http: AllowlistedHttpClient;
  readonly #options: ArxivSourceOptions;
  readonly #baseUrl: URL;
  readonly #parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: false,
  });

  constructor(http: AllowlistedHttpClient, options: ArxivSourceOptions = {}) {
    this.#http = http;
    this.#options = options;
    this.name = options.set ? `arxiv-${options.set}` : "arxiv";
    this.overlapDays = options.overlapDays ?? 0;
    this.#baseUrl = new URL(options.baseUrl ?? "https://export.arxiv.org/oai2");
  }

  async fetch(request: SourceFetchRequest): Promise<SourceFetchResult> {
    let token = request.cursor;
    const records: SourceDocument[] = [];
    const maxPages = this.#options.maxPages ?? 100;
    for (let page = 0; page < maxPages; page += 1) {
      if (page > 0 && (this.#options.requestDelayMs ?? 3_100) > 0) {
        await delay(this.#options.requestDelayMs ?? 3_100);
      }
      const url = new URL(this.#baseUrl);
      url.searchParams.set("verb", "ListRecords");
      if (token) {
        url.searchParams.set("resumptionToken", token);
      } else {
        url.searchParams.set("metadataPrefix", "arXiv");
        url.searchParams.set("from", request.from);
        url.searchParams.set("until", request.to);
        if (this.#options.set) url.searchParams.set("set", this.#options.set);
      }
      const xml = await this.#http.getText(url, {
        Accept: "application/xml, text/xml",
      });
      const parsed = this.#parser.parse(xml) as UnknownRecord;
      const list = nested(parsed, "OAI-PMH", "ListRecords") as
        UnknownRecord | undefined;
      const rawRecords = arrayify(list?.record);
      for (const record of rawRecords) {
        const normalized = arxivRecord(record as UnknownRecord);
        if (normalized && this.#matchesCategories(normalized.categories ?? []))
          records.push(normalized);
      }
      token = textValue(list?.resumptionToken);
      if (!token) return { records };
    }
    return { records, ...(token ? { cursor: token } : {}) };
  }

  #matchesCategories(categories: string[]): boolean {
    const prefixes = this.#options.categoryPrefixes;
    return (
      !prefixes?.length ||
      categories.some((category) =>
        prefixes.some((prefix) => category.startsWith(prefix)),
      )
    );
  }
}

function arxivRecord(record: UnknownRecord): SourceDocument | undefined {
  const header = record.header as UnknownRecord | undefined;
  if (header?.["@_status"] === "deleted") return undefined;
  const metadata = record.metadata as UnknownRecord | undefined;
  const arxiv = metadata?.arXiv as UnknownRecord | undefined;
  const rawId =
    textValue(arxiv?.id) ??
    textValue(header?.identifier)?.replace(/^oai:arXiv\.org:/, "");
  const title = textValue(arxiv?.title);
  const abstract = textValue(arxiv?.abstract);
  const created = textValue(arxiv?.created);
  if (!rawId || !title || !created) return undefined;
  const authorsNode = (arxiv?.authors as UnknownRecord | undefined)?.author;
  const authors = arrayify(authorsNode).map((author) => {
    const value = author as UnknownRecord;
    return compactText(
      [textValue(value.forenames), textValue(value.keyname)]
        .filter(Boolean)
        .join(" "),
    );
  });
  const categories = (textValue(arxiv?.categories) ?? "")
    .split(/\s+/)
    .filter(Boolean);
  const doi = textValue(arxiv?.doi);
  const license = textValue(arxiv?.license);
  return {
    source: "arxiv",
    sourceId: rawId,
    title: compactText(title),
    authors,
    abstract: compactText(abstract ?? ""),
    publishedAt: created,
    ...(textValue(arxiv?.updated)
      ? { updatedAt: textValue(arxiv?.updated)! }
      : {}),
    url: `https://arxiv.org/abs/${rawId}`,
    pdfUrl: `https://arxiv.org/pdf/${rawId}`,
    ...(doi ? { doi } : {}),
    ...(categories.length ? { categories } : {}),
    ...(license ? { license } : {}),
    metadata: {
      comments: textValue(arxiv?.comments),
      journalReference: textValue(arxiv?.["journal-ref"]),
    },
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function nested(object: UnknownRecord, ...keys: string[]): unknown {
  return keys.reduce<unknown>(
    (value, key) =>
      value && typeof value === "object"
        ? (value as UnknownRecord)[key]
        : undefined,
    object,
  );
}

function arrayify(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number")
    return compactText(String(value)) || undefined;
  if (value && typeof value === "object" && "#text" in value)
    return textValue((value as UnknownRecord)["#text"]);
  return undefined;
}
