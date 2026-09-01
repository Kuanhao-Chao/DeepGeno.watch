import { describe, expect, it } from "vitest";

import { publicPaperContentSchema } from "../apps/web/src/lib/public-paper-schema.js";

const timestamp = "2026-08-28T07:00:00.000Z";

describe("publicPaperContentSchema", () => {
  it("adapts the canonical public contract to Astro Date values", () => {
    const result = publicPaperContentSchema.parse({
      schemaVersion: "2.0",
      slug: "a-paper-1234567",
      title: "A paper",
      authors: ["A. Author"],
      publicationDate: "2026-08-28",
      publishedAt: timestamp,
      updatedAt: timestamp,
      source: "biorxiv",
      url: "https://example.org/paper",
      hook: "A compact hook.",
      priority: "must-read",
      progress: "queued",
      tags: ["foundation-model"],
      topics: ["dna-language-model"],
      organisms: ["human"],
      modalities: ["DNA"],
      evidence: {
        scope: "abstract-only",
        fullTextAvailable: false,
        references: [
          {
            id: "e1",
            documentKind: "abstract",
            sourceUrl: "https://example.org/paper",
            locator: { section: "Abstract" },
          },
        ],
      },
      coreProblem: { statement: "Problem.", evidenceIds: ["e1"] },
      novelty: [{ statement: "Novelty.", evidenceIds: ["e1"] }],
      architecture: {
        overview: "A sequence encoder.",
        modelFamily: "transformer",
        parameterScale: null,
        representation: "nucleotide tokens",
        tokenization: null,
        contextLength: null,
        trainingObjectives: [],
        evidenceIds: ["e1"],
      },
      datasets: [],
      benchmarks: [],
      results: [],
      takeaways: [{ statement: "Takeaway.", evidenceIds: ["e1"] }],
      limitations: [],
      provenance: {
        generation: {
          provider: "openai",
          model: "gpt-5.6-terra",
          generatedAt: timestamp,
          prompt: { id: "technical-summary", version: "1" },
          outputSchemaVersion: "1.0",
        },
        review: { approvedAt: timestamp },
      },
    });

    expect(result.publicationDate).toBeInstanceOf(Date);
    expect(result.publishedAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
    expect(result.provenance.generation.generatedAt).toBeInstanceOf(Date);
    expect(result.provenance.review.approvedAt).toBeInstanceOf(Date);
  });

  it("retains the canonical strict evidence-reference boundary", () => {
    expect(() =>
      publicPaperContentSchema.parse({
        schemaVersion: "2.0",
        unexpected: "private-field",
      }),
    ).toThrow();
  });
});
