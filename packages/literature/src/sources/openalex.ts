import { AllowlistedHttpClient } from "../http.js";
import type { Enrichment, MetadataEnricher, SourceDocument } from "../ports.js";
import { canonicalDoi, compactText, uniqueStrings } from "../util.js";

interface OpenAlexWork {
  doi?: string;
  cited_by_count?: number;
  authorships?: Array<{
    institutions?: Array<{ display_name?: string }>;
  }>;
  locations?: Array<{ landing_page_url?: string; pdf_url?: string }>;
  open_access?: { oa_url?: string };
}

export class OpenAlexDoiEnricher implements MetadataEnricher {
  readonly name = "openalex";
  readonly #http: AllowlistedHttpClient;
  readonly #apiKey: string | undefined;
  readonly #baseUrl: URL;

  constructor(
    http: AllowlistedHttpClient,
    options: { apiKey?: string; baseUrl?: string } = {},
  ) {
    this.#http = http;
    this.#apiKey = options.apiKey;
    this.#baseUrl = new URL(options.baseUrl ?? "https://api.openalex.org");
  }

  async enrich(record: SourceDocument): Promise<Enrichment | undefined> {
    const doi = canonicalDoi(record.doi);
    if (!doi) return undefined;
    const url = new URL(
      `/works/https://doi.org/${encodeURIComponent(doi)}`,
      this.#baseUrl,
    );
    if (this.#apiKey) url.searchParams.set("api_key", this.#apiKey);
    const work = await this.#http.getJson<OpenAlexWork>(url);
    const locations = work.locations ?? [];
    const repositoryUrls = uniqueStrings([
      work.open_access?.oa_url,
      ...locations.flatMap((location) => [
        location.landing_page_url,
        location.pdf_url,
      ]),
    ]);
    return {
      doi: canonicalDoi(work.doi) ?? doi,
      affiliations: uniqueStrings(
        work.authorships?.flatMap(
          (authorship) =>
            authorship.institutions?.map((institution) =>
              compactText(institution.display_name ?? ""),
            ) ?? [],
        ) ?? [],
      ),
      ...(typeof work.cited_by_count === "number"
        ? { citationCount: work.cited_by_count }
        : {}),
      codeUrls: repositoryUrls.filter((entry) =>
        /github\.com|gitlab\.com|bitbucket\.org/i.test(entry),
      ),
      dataUrls: repositoryUrls.filter((entry) =>
        /zenodo\.org|figshare\.com|dryad|osf\.io/i.test(entry),
      ),
    };
  }
}
