import { describe, expect, it, vi } from "vitest";
import { AllowlistedHttpClient } from "../http.js";
import type { SourceDocument } from "../ports.js";
import { ArxivOaiSource } from "./arxiv.js";
import { BioRxivSource } from "./biorxiv.js";
import { CrossrefIssnSource } from "./crossref.js";
import { EuropePmcEnricher } from "./europe-pmc.js";
import { EuropePmcSearchSource } from "./europe-pmc-search.js";
import { OpenAlexDoiEnricher } from "./openalex.js";

describe("literature source adapters", () => {
  it("pages bioRxiv date windows and preserves complete metadata", async () => {
    const getText = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          messages: [{ count: 1, total: 2 }],
          collection: [bioRxivItem("10.1101/one", "1")],
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          messages: [{ count: 1, total: 2 }],
          collection: [bioRxivItem("10.1101/two", "2")],
        }),
      );
    const source = new BioRxivSource(
      { getText } as unknown as AllowlistedHttpClient,
      {
        overlapDays: 3,
      },
    );

    const result = await source.fetch({ from: "2026-08-25", to: "2026-08-28" });

    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toMatchObject({
      source: "biorxiv",
      sourceId: "10.1101/one",
      authors: ["Ada Genome", "Lin Sequence"],
      pdfUrl: "https://www.biorxiv.org/content/10.1101/onev1.full.pdf",
    });
    expect(String(getText.mock.calls[1]![0])).toContain(
      "/2026-08-25/2026-08-28/1",
    );
  });

  it("treats bioRxiv's empty successful current-day response as no records", async () => {
    const getText = vi.fn().mockResolvedValue("");
    const source = new BioRxivSource({
      getText,
    } as unknown as AllowlistedHttpClient);

    const result = await source.fetch({
      from: "2026-08-28",
      to: "2026-08-28",
    });

    expect(result).toEqual({ records: [] });
    expect(getText).toHaveBeenCalledOnce();
  });

  it("parses arXiv OAI records and applies the configured category boundary", async () => {
    const getText = vi.fn().mockResolvedValue(`
      <OAI-PMH>
        <ListRecords>
          <record>
            <header><identifier>oai:arXiv.org:2608.12345</identifier></header>
            <metadata>
              <arXiv>
                <id>2608.12345</id>
                <created>2026-08-27</created>
                <updated>2026-08-28</updated>
                <title>A genomic sequence transformer</title>
                <authors><author><keyname>Genome</keyname><forenames>Ada</forenames></author></authors>
                <categories>q-bio.GN cs.LG</categories>
                <doi>10.1000/arxiv-test</doi>
                <abstract>A complete abstract about a genomic language model and regulatory sequence prediction with enough technical detail for downstream filtering.</abstract>
              </arXiv>
            </metadata>
          </record>
          <record>
            <header><identifier>oai:arXiv.org:2608.99999</identifier></header>
            <metadata>
              <arXiv>
                <id>2608.99999</id><created>2026-08-27</created>
                <title>Unrelated physics</title>
                <authors><author><keyname>Other</keyname><forenames>Pat</forenames></author></authors>
                <categories>physics.bio-ph</categories><abstract>Unrelated content.</abstract>
              </arXiv>
            </metadata>
          </record>
          <resumptionToken></resumptionToken>
        </ListRecords>
      </OAI-PMH>`);
    const source = new ArxivOaiSource(
      { getText } as unknown as AllowlistedHttpClient,
      { set: "q-bio", categoryPrefixes: ["q-bio."] },
    );

    const result = await source.fetch({ from: "2026-08-27", to: "2026-08-28" });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      sourceId: "2608.12345",
      authors: ["Ada Genome"],
      categories: ["q-bio.GN", "cs.LG"],
      doi: "10.1000/arxiv-test",
      pdfUrl: "https://arxiv.org/pdf/2608.12345",
    });
    const requested = getText.mock.calls[0]![0] as URL;
    expect(requested.origin).toBe("https://oaipmh.arxiv.org");
    expect(requested.pathname).toBe("/oai");
    expect(requested.searchParams.get("set")).toBe("q-bio");
    expect(requested.searchParams.get("metadataPrefix")).toBe("arXiv");
  });

  it("normalizes Crossref journal records and strips abstract markup", async () => {
    const getJson = vi.fn().mockResolvedValue({
      message: {
        items: [
          {
            DOI: "10.1000/CROSSREF-TEST",
            title: ["Sequence models in regulatory genomics"],
            abstract:
              "<jats:p>A <jats:bold>DNA transformer</jats:bold> predicts enhancer activity.</jats:p>",
            author: [
              {
                given: "Ada",
                family: "Genome",
                affiliation: [{ name: "Genome Institute" }],
              },
            ],
            URL: "https://doi.org/10.1000/CROSSREF-TEST",
            published: { "date-parts": [[2026, 8, 28]] },
            indexed: { "date-time": "2026-08-28T12:00:00Z" },
            "container-title": ["Genome Biology"],
          },
        ],
        "next-cursor": "*",
      },
    });
    const source = new CrossrefIssnSource(
      { getJson } as unknown as AllowlistedHttpClient,
      { issn: "1474-760X", journal: "Genome Biology", rows: 100 },
    );

    const result = await source.fetch({ from: "2026-08-25", to: "2026-08-28" });

    expect(result.records[0]).toMatchObject({
      doi: "10.1000/CROSSREF-TEST",
      abstract: "A DNA transformer predicts enhancer activity.",
      authors: ["Ada Genome"],
      affiliations: ["Genome Institute"],
      publishedAt: "2026-08-28",
    });
    const requested = getJson.mock.calls[0]![0] as URL;
    expect(requested.searchParams.get("filter")).toBe(
      "from-created-date:2026-08-25,until-created-date:2026-08-28",
    );
  });

  it("discovers complete journal abstracts through Europe PMC core search", async () => {
    const getJson = vi.fn().mockResolvedValue({
      hitCount: 1,
      nextCursorMark: "*",
      resultList: {
        result: [
          {
            id: "12345678",
            source: "MED",
            pmid: "12345678",
            pmcid: "PMC123",
            doi: "10.1000/europe-pmc-test",
            title: "A regulatory genomics foundation model",
            abstractText:
              "We train a genomic foundation model on nucleotide sequence and evaluate enhancer activity, gene regulation, and noncoding variant prediction across held-out human cell types. The complete abstract contains enough methodological and biological context for deterministic Gate 1 filtering.",
            authorList: {
              author: [{ fullName: "Genome A" }, { fullName: "Sequence L" }],
            },
            affiliationList: {
              affiliation: [{ affiliation: "Genome Institute" }],
            },
            journalTitle: "Nature Genetics",
            firstPublicationDate: "2026-08-28",
            pubTypeList: { pubType: ["research article"] },
            isOpenAccess: "Y",
          },
        ],
      },
    });
    const source = new EuropePmcSearchSource(
      { getJson } as unknown as AllowlistedHttpClient,
      {
        journals: ["Nature Genetics", "Genome Biology"],
        pageSize: 100,
        overlapDays: 3,
      },
    );

    const result = await source.fetch({
      from: "2026-08-25",
      to: "2026-08-28",
    });

    expect(result.records[0]).toMatchObject({
      source: "europe-pmc",
      sourceId: "12345678",
      doi: "10.1000/europe-pmc-test",
      authors: ["Genome A", "Sequence L"],
      affiliations: ["Genome Institute"],
      journal: "Nature Genetics",
      publishedAt: "2026-08-28",
    });
    const requested = getJson.mock.calls[0]![0] as URL;
    expect(requested.searchParams.get("resultType")).toBe("core");
    expect(requested.searchParams.get("cursorMark")).toBe("*");
    expect(requested.searchParams.get("query")).toContain(
      'FIRST_PDATE:[2026-08-25 TO 2026-08-28] AND (JOURNAL:"Nature Genetics"',
    );
  });

  it("uses legally exposed Europe PMC JATS and singleton OpenAlex metadata", async () => {
    const europeJson = vi.fn().mockResolvedValue({
      resultList: {
        result: [
          {
            pmcid: "PMC123",
            doi: "10.1000/test",
            citedByCount: 7,
            isOpenAccess: "Y",
          },
        ],
      },
    });
    const europeText = vi.fn().mockResolvedValue(`
      <article>
        <permissions><license><license-p><ext-link>https://creativecommons.org/licenses/by/4.0/</ext-link></license-p></license></permissions>
        <body><sec><p>Code: https://github.com/example/deepgeno</p><p>Data: https://zenodo.org/records/123</p></sec></body>
      </article>`);
    const europe = new EuropePmcEnricher({
      getJson: europeJson,
      getText: europeText,
    } as unknown as AllowlistedHttpClient);
    const openAlexJson = vi.fn().mockResolvedValue({
      doi: "https://doi.org/10.1000/test",
      cited_by_count: 9,
      authorships: [{ institutions: [{ display_name: "Genome Institute" }] }],
      open_access: { oa_url: "https://zenodo.org/records/123" },
      locations: [{ landing_page_url: "https://github.com/example/deepgeno" }],
    });
    const openAlex = new OpenAlexDoiEnricher(
      { getJson: openAlexJson } as unknown as AllowlistedHttpClient,
      { apiKey: "fixture-key" },
    );
    const record = enrichmentRecord();

    await expect(europe.enrich(record)).resolves.toMatchObject({
      doi: "10.1000/test",
      citationCount: 7,
      codeUrls: ["https://github.com/example/deepgeno"],
      dataUrls: ["https://zenodo.org/records/123"],
      fullText: {
        format: "jats",
        sourceUrl: expect.stringContaining("PMC123"),
      },
    });
    await expect(openAlex.enrich(record)).resolves.toMatchObject({
      doi: "10.1000/test",
      citationCount: 9,
      affiliations: ["Genome Institute"],
      codeUrls: ["https://github.com/example/deepgeno"],
      dataUrls: ["https://zenodo.org/records/123"],
    });
    const openAlexUrl = openAlexJson.mock.calls[0]![0] as URL;
    expect(openAlexUrl.pathname).toContain("10.1000%2Ftest");
    expect(openAlexUrl.searchParams.get("api_key")).toBe("fixture-key");
  });
});

function bioRxivItem(doi: string, version: string) {
  return {
    doi,
    title: "A DNA language model",
    authors: "Ada Genome; Lin Sequence",
    abstract:
      "A sufficiently complete abstract about genomic sequence models, enhancer function, and variant prediction for a source adapter fixture.",
    date: "2026-08-28",
    version,
    category: "bioinformatics",
    license: "CC-BY-4.0",
  };
}

function enrichmentRecord(): SourceDocument {
  return {
    source: "crossref",
    sourceId: "10.1000/test",
    title: "A DNA language model",
    authors: ["Ada Genome"],
    abstract: "A complete abstract.",
    publishedAt: "2026-08-28",
    url: "https://doi.org/10.1000/test",
    doi: "10.1000/test",
  };
}
