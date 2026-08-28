import { describe, expect, it } from "vitest";

import {
  AppConfigSchema,
  CandidateDecisionActionSchema,
  CandidateDecisionSchema,
  CandidateSchema,
  DraftSummarySchema,
  EvidencePacketSchema,
  PrioritySchema,
  ProgressSchema,
  PublicPaperSchema,
  TechnicalSummarySchema,
  contractJsonSchemas,
} from "./index.js";

const digest = "a".repeat(64);
const timestamp = "2026-08-27T13:17:00-07:00";

const evidence = {
  schemaVersion: "1.0",
  id: "evidence-paper-1-r1",
  paperId: "paper-1",
  scope: "abstract-only",
  documents: [
    {
      id: "document-1",
      kind: "abstract",
      title: "An abstract",
      sourceUrl: "https://example.org/paper-1",
      retrievedAt: timestamp,
      mediaType: "text/plain",
      access: "abstract-access",
      contentSha256: digest,
    },
  ],
  references: [
    {
      id: "e1",
      documentId: "document-1",
      kind: "abstract",
      locator: { section: "Abstract" },
      text: "Evidence for the claim.",
      textSha256: digest,
    },
  ],
  assembledAt: timestamp,
  assemblerVersion: "1.0.0",
  inputSha256: digest,
  warnings: [],
} as const;

const statement = {
  statement: "Evidence-backed statement.",
  evidenceIds: ["e1"],
};

const summary = {
  schemaVersion: "1.0",
  hook: "A compact hook.",
  coreProblem: statement,
  novelty: [statement],
  architecture: {
    overview: "A sequence encoder.",
    modelFamily: "transformer",
    parameterScale: null,
    representation: "nucleotide tokens",
    tokenization: null,
    contextLength: null,
    trainingObjectives: ["masked-token prediction"],
    evidenceIds: ["e1"],
  },
  data: {
    datasets: [
      {
        name: "Genome corpus",
        role: "pretraining",
        scale: null,
        organisms: ["human"],
        evidenceIds: ["e1"],
      },
    ],
    benchmarks: [
      {
        name: "Enhancer benchmark",
        role: "benchmark",
        scale: null,
        organisms: ["human"],
        evidenceIds: ["e1"],
      },
    ],
  },
  quantitativeResults: [
    {
      claim: "Improves AUROC.",
      metric: "AUROC",
      value: "0.91",
      baseline: null,
      delta: null,
      benchmark: "Enhancer benchmark",
      evidenceIds: ["e1"],
    },
  ],
  takeaways: [statement],
  limitations: [statement],
  topics: ["dna-language-model"],
  tags: ["foundation-model"],
  organisms: ["human"],
  modalities: ["DNA"],
  links: {
    code: "https://github.com/example/model",
    data: null,
    project: null,
  },
  evidenceScope: "abstract-only",
} as const;

describe("fixed curation vocabulary", () => {
  it("accepts only the agreed enum values", () => {
    expect(PrioritySchema.options).toEqual([
      "must-read",
      "recommended",
      "notable",
    ]);
    expect(ProgressSchema.options).toEqual(["queued", "skimmed", "read"]);
    expect(CandidateDecisionActionSchema.options).toEqual([
      "summarize",
      "defer",
      "dismiss",
    ]);
    expect(PrioritySchema.safeParse("urgent").success).toBe(false);
  });
});

describe("candidate triage", () => {
  it("requires a complete abstract at the candidate boundary", () => {
    const result = CandidateSchema.safeParse({
      schemaVersion: "1.0",
      id: "candidate-1",
      revision: 1,
      paper: {
        schemaVersion: "1.0",
        id: "paper-1",
        title: "A paper",
        authors: [{ name: "A. Author", affiliations: [] }],
        identifiers: [],
        publicationKind: "preprint",
        landingUrl: "https://example.org/paper-1",
        sourceRecords: [
          {
            source: "biorxiv",
            sourceRecordId: "record-1",
            landingUrl: "https://example.org/paper-1",
            retrievedAt: timestamp,
          },
        ],
        firstSeenAt: timestamp,
        lastSeenAt: timestamp,
        identity: {
          canonicalKey: "title:a-paper",
          matchedBy: ["title-authors"],
        },
      },
      topics: ["sequence-to-function"],
      relevance: {
        score: 0.8,
        lexicalScore: 0.8,
        matchedKeywords: ["genome"],
        excludedKeywords: [],
        reasons: ["Matches domain vocabulary"],
        assessedAt: timestamp,
        rulesetVersion: "1",
      },
      discoveredAt: timestamp,
      discoveryRunId: "run-1",
      status: "awaiting-triage",
      recordSha256: digest,
    });

    expect(result.success).toBe(false);
  });

  it("requires processors to provide deferUntil without inventing a default", () => {
    const base = {
      candidateId: "candidate-1",
      candidateRevision: 1,
      action: "defer",
      decidedAt: timestamp,
      decidedBy: { id: "curator", kind: "human" },
    } as const;

    expect(CandidateDecisionSchema.safeParse(base).success).toBe(false);
    expect(
      CandidateDecisionSchema.parse({
        ...base,
        deferUntil: "2026-09-03T13:17:00-07:00",
      }).deferUntil,
    ).toBe("2026-09-03T13:17:00-07:00");
  });
});

describe("evidence-grounded summaries", () => {
  it("rejects evidence references to unknown documents", () => {
    const result = EvidencePacketSchema.safeParse({
      ...evidence,
      references: [{ ...evidence.references[0], documentId: "missing" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a canonical summary when every claim resolves to packet evidence", () => {
    const result = DraftSummarySchema.safeParse({
      schemaVersion: "1.0",
      id: "draft-1",
      revision: 1,
      candidateId: "candidate-1",
      candidateRevision: 1,
      paperId: "paper-1",
      summary,
      evidence,
      generation: {
        provider: "openai",
        model: "configured-model",
        generatedAt: timestamp,
        prompt: { id: "technical-summary", version: "1", sha256: digest },
        outputSchemaVersion: "1.0",
        inputSha256: digest,
      },
      recordSha256: digest,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a summary that cites evidence absent from its packet", () => {
    const invalidSummary = {
      ...summary,
      coreProblem: { ...summary.coreProblem, evidenceIds: ["missing"] },
    };
    const result = DraftSummarySchema.safeParse({
      schemaVersion: "1.0",
      id: "draft-1",
      revision: 1,
      candidateId: "candidate-1",
      candidateRevision: 1,
      paperId: "paper-1",
      summary: invalidSummary,
      evidence,
      generation: {
        provider: "anthropic",
        model: "configured-model",
        generatedAt: timestamp,
        prompt: { id: "technical-summary", version: "1", sha256: digest },
        outputSchemaVersion: "1.0",
        inputSha256: digest,
      },
      recordSha256: digest,
    });
    expect(result.success).toBe(false);
  });
});

describe("configuration and publication", () => {
  it("requires an explicit synthesis provider and model", () => {
    const result = AppConfigSchema.safeParse({
      schemaVersion: "1.0",
      timezone: "America/Los_Angeles",
      schedule: "17 6 * * *",
      sources: [{ source: "arxiv", enabled: true, overlapDays: 2 }],
      relevance: {
        topics: ["dna-language-model"],
        includeKeywords: ["genome"],
        excludeKeywords: [],
        threshold: 0.5,
      },
      synthesis: {
        model: { maxOutputTokens: 3000 },
        promptId: "summary",
        promptVersion: "1",
      },
    });
    expect(result.success).toBe(false);
  });

  it("exports reusable JSON Schema for strict model output", () => {
    const schema = contractJsonSchemas.technicalSummary();
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.type).toBe("object");
  });

  it("keeps the public record detailed and human-approved", () => {
    const result = PublicPaperSchema.safeParse({
      schemaVersion: "1.0",
      paperId: "paper-1",
      title: "A paper",
      authors: ["A. Author"],
      publishedAt: timestamp,
      updatedAt: timestamp,
      source: "biorxiv",
      url: "https://example.org/paper-1",
      hook: summary.hook,
      priority: "must-read",
      progress: "queued",
      tags: summary.tags,
      topics: summary.topics,
      organisms: summary.organisms,
      modalities: summary.modalities,
      evidence: {
        scope: "abstract-only",
        fullTextAvailable: false,
        sources: [
          {
            id: "e1",
            documentKind: "abstract",
            sourceUrl: "https://example.org/paper-1",
            locator: { section: "Abstract" },
            contentSha256: digest,
          },
        ],
      },
      coreProblem: summary.coreProblem,
      novelty: summary.novelty,
      architecture: summary.architecture,
      datasets: summary.data.datasets,
      benchmarks: summary.data.benchmarks,
      results: summary.quantitativeResults,
      takeaways: summary.takeaways,
      limitations: summary.limitations,
      provenance: {
        generation: {
          provider: "openai",
          model: "configured-model",
          generatedAt: timestamp,
          prompt: { id: "technical-summary", version: "1", sha256: digest },
          outputSchemaVersion: "1.0",
          inputSha256: digest,
        },
        review: {
          draftId: "draft-1",
          draftRevision: 1,
          approvedAt: timestamp,
          approvedBy: { id: "curator", kind: "human" },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("parses the rich summary independently", () => {
    expect(TechnicalSummarySchema.safeParse(summary).success).toBe(true);
  });
});
