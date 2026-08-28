import { XMLParser } from "fast-xml-parser";
import { AllowlistedHttpClient } from "../http.js";
import type { Enrichment, MetadataEnricher, SourceDocument } from "../ports.js";
import { canonicalDoi, compactText, uniqueStrings } from "../util.js";

interface EuropePmcSearchResponse {
  resultList?: {
    result?: Array<{
      id?: string;
      pmcid?: string;
      doi?: string;
      citedByCount?: number;
      isOpenAccess?: string;
    }>;
  };
}

export class EuropePmcEnricher implements MetadataEnricher {
  readonly name = "europe-pmc";
  readonly #http: AllowlistedHttpClient;
  readonly #baseUrl: URL;
  readonly #preferOpenAccessJats: boolean;

  constructor(
    http: AllowlistedHttpClient,
    options: { baseUrl?: string; preferOpenAccessJats?: boolean } = {},
  ) {
    this.#http = http;
    const configured =
      options.baseUrl ?? "https://www.ebi.ac.uk/europepmc/webservices/rest/";
    this.#baseUrl = new URL(
      configured.endsWith("/") ? configured : `${configured}/`,
    );
    this.#preferOpenAccessJats = options.preferOpenAccessJats ?? true;
  }

  async enrich(record: SourceDocument): Promise<Enrichment | undefined> {
    const doi = canonicalDoi(record.doi);
    if (!doi) return undefined;
    const search = new URL("search", this.#baseUrl);
    search.searchParams.set("query", `DOI:${doi}`);
    search.searchParams.set("format", "json");
    search.searchParams.set("pageSize", "1");
    const response = await this.#http.getJson<EuropePmcSearchResponse>(search);
    const match = response.resultList?.result?.[0];
    if (!match) return undefined;

    const enrichment: Enrichment = {
      doi: canonicalDoi(match.doi) ?? doi,
      ...(typeof match.citedByCount === "number"
        ? { citationCount: match.citedByCount }
        : {}),
    };
    if (
      this.#preferOpenAccessJats &&
      match.pmcid &&
      match.isOpenAccess?.toUpperCase() === "Y"
    ) {
      const fullTextUrl = new URL(
        `${encodeURIComponent(match.pmcid)}/fullTextXML`,
        this.#baseUrl,
      );
      try {
        const xml = await this.#http.getText(fullTextUrl, {
          Accept: "application/xml, text/xml",
        });
        const license = extractJatsLicense(xml);
        enrichment.fullText = {
          format: "jats",
          content: xml,
          sourceUrl: fullTextUrl.toString(),
          ...(license ? { license } : {}),
        };
        const urls = extractRepositoryUrls(xml);
        enrichment.codeUrls = urls.filter((url) =>
          /github\.com|gitlab\.com|bitbucket\.org/i.test(url),
        );
        enrichment.dataUrls = urls.filter((url) =>
          /zenodo\.org|figshare\.com|dryad|osf\.io/i.test(url),
        );
      } catch {
        // Metadata is still useful when Europe PMC has not materialized XML yet.
      }
    }
    return enrichment;
  }
}

function extractJatsLicense(xml: string): string | undefined {
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
  });
  try {
    const parsed = parser.parse(xml) as Record<string, unknown>;
    const serialized = JSON.stringify(parsed);
    return (
      compactText(
        serialized
          .match(
            /https?:\\?\/\\?\/creativecommons\.org\\?\/licenses\\?\/[^"\\]+/i,
          )?.[0]
          ?.replaceAll("\\/", "/") ?? "",
      ) || undefined
    );
  } catch {
    return undefined;
  }
}

function extractRepositoryUrls(xml: string): string[] {
  return uniqueStrings(
    [...xml.matchAll(/https?:\/\/[^\s<>"']+/gi)].map((match) =>
      match[0]?.replace(/[),.;]+$/, ""),
    ),
  );
}
