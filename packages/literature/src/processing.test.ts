import { describe, expect, it } from "vitest";
import type { SourceDocument } from "./ports.js";
import { normalizeAndRank } from "./processing.js";

describe("relevance processing", () => {
  it("requires an explicit computational signal when the policy enables the gate", () => {
    const policy = {
      topicTerms: {
        "sequence-to-function": ["sequence-to-function"],
        epigenomics: ["chromatin accessibility", "histone modification"],
        "single-cell-deep-learning": ["single-cell"],
      },
      computationalSignals: [
        "deep learning",
        "transformer",
        "neural network",
        "modelling",
      ],
      requireComputationalSignal: true,
      genomicsSignals: ["genomic", "chromatin"],
    };
    const computational = sourceDocument(
      "computational",
      "Sequence-to-function deep-learning decodes enhancer activity",
      "We train a genomic sequence model to predict chromatin accessibility from DNA and validate the learned regulatory syntax across multiple held-out tissues and experimental assays.",
    );
    const wetLab = sourceDocument(
      "wet-lab",
      "Early life stress changes chromatin accessibility in single-cell profiles",
      "We profile single-cell populations and histone modification patterns after an environmental exposure, identifying persistent chromatin accessibility changes during development. The study reports descriptive molecular measurements across multiple stages and tissues.",
    );

    const papers = normalizeAndRank(
      [computational, { ...computational }, wetLab],
      new Map(),
      policy,
    );

    expect(papers.map((paper) => paper.title)).toEqual([computational.title]);
    expect(papers[0]?.matchedTerms).toContain("deep learning");
    expect(papers[0]?.sourceRecords).toHaveLength(1);
  });
});

function sourceDocument(
  sourceId: string,
  title: string,
  abstract: string,
): SourceDocument {
  return {
    source: "biorxiv",
    sourceId,
    title,
    authors: ["Ada Genome"],
    abstract,
    publishedAt: "2026-08-27",
    url: `https://example.org/${sourceId}`,
  };
}
