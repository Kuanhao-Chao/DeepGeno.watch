import type {
  LiteratureSource,
  SourceDocument,
  SourceFetchRequest,
  SourceFetchResult,
} from "../ports.js";

export class FixtureSource implements LiteratureSource {
  readonly source;
  readonly name: string;
  readonly #records: readonly SourceDocument[];

  constructor(records: readonly SourceDocument[], name = "fixture") {
    this.#records = records;
    this.name = name;
    this.source = records[0]?.source ?? "biorxiv";
  }

  async fetch(request: SourceFetchRequest): Promise<SourceFetchResult> {
    return {
      records: this.#records
        .filter(
          (record) =>
            record.publishedAt.slice(0, 10) >= request.from &&
            record.publishedAt.slice(0, 10) <= request.to,
        )
        .map((record) => structuredClone(record)),
    };
  }
}
