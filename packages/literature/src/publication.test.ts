import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";
import { describe, expect, it } from "vitest";
import YAML from "yaml";

import {
  PublicPaperSchema,
  type DraftSummary,
  type PublishedPaper,
} from "@deepgeno/contracts";
import { PublicDeclassifier } from "./publication.js";

const timestamp = "2026-08-28T07:00:00.000Z";
const digest = "a".repeat(64);

describe("PublicDeclassifier", () => {
  it("emits deterministic v2 Markdown with remapped evidence and no private provenance", () => {
    const projection = new PublicDeclassifier().declassify(
      publishedPaper(),
      draftSummary(),
    );
    const markdown = new TextDecoder().decode(projection.bytes);
    const frontmatter = YAML.parse(markdown.split("---")[1]!);

    expect(projection).toMatchObject({
      version: "1.0",
      slug: "a-paper-1234567",
      path: "content/public/papers/a-paper-1234567.md",
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(projection.sha256).toBe(
      createHash("sha256").update(projection.bytes).digest("hex"),
    );
    expect(frontmatter).toMatchObject({
      schemaVersion: "2.0",
      slug: "a-paper-1234567",
      projectUrl: "https://example.org/project",
      coreProblem: { evidenceIds: ["e1"] },
      novelty: [{ evidenceIds: ["e2"] }],
      evidence: {
        sources: [
          { id: "e1", sourceUrl: "https://example.org/paper" },
          { id: "e2", sourceUrl: "https://example.org/supplement" },
        ],
      },
      provenance: {
        generation: {
          provider: "openai",
          model: "gpt-5",
          prompt: { id: "technical-summary", version: "7" },
        },
        review: { approvedAt: timestamp },
      },
    });
    expect(PublicPaperSchema.safeParse(frontmatter).success).toBe(true);
    expect(
      [
        frontmatter.coreProblem,
        ...frontmatter.novelty,
        frontmatter.architecture,
        ...frontmatter.datasets,
        ...frontmatter.benchmarks,
        ...frontmatter.results,
        ...frontmatter.takeaways,
        ...frontmatter.limitations,
      ].flatMap((entry) => entry.evidenceIds),
    ).toEqual(["e1", "e2", "e1", "e1", "e2", "e1", "e2", "e1"]);
    for (const privateMarker of [
      "paperId:",
      "draft-1",
      "private-evidence-a",
      "curator",
      "contentSha256",
      "inputSha256",
      "requestId",
      "inputTokens",
      "pullRequestUrl",
      "commitSha",
      digest,
    ]) {
      expect(markdown).not.toContain(privateMarker);
    }
  });
});

function publishedPaper(): PublishedPaper {
  return {
    schemaVersion: "1.0",
    slug: "a-paper-1234567",
    paper: {
      schemaVersion: "1.0",
      id: "paper-1",
      title: "A paper",
      authors: [{ name: "A. Author", affiliations: [] }],
      identifiers: [{ type: "doi", value: "10.1000/a-paper" }],
      publicationKind: "preprint",
      landingUrl: "https://example.org/paper",
      sourceRecords: [
        {
          source: "biorxiv",
          sourceRecordId: "record-1",
          landingUrl: "https://example.org/paper",
          retrievedAt: timestamp,
        },
      ],
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
      identity: { canonicalKey: "doi:10.1000/a-paper", matchedBy: ["doi"] },
    },
    summary: draftSummary().summary,
    priority: "must-read",
    progress: "queued",
    publishedAt: timestamp,
    updatedAt: timestamp,
    review: {
      draftId: "draft-1",
      draftRevision: 1,
      approvedAt: timestamp,
      approvedBy: { id: "curator", kind: "human" },
      pullRequestUrl: "https://github.com/example/private/pull/1",
      commitSha: "b".repeat(40),
    },
    evidence: {
      scope: "abstract-only",
      citations: [
        {
          id: "private-evidence-a",
          documentKind: "abstract",
          sourceUrl: "https://example.org/paper",
          locator: { section: "Abstract" },
          contentSha256: digest,
        },
        {
          id: "private-evidence-b",
          documentKind: "supplement",
          sourceUrl: "https://example.org/supplement",
          locator: { table: "S1" },
          contentSha256: digest,
        },
      ],
    },
  };
}

function draftSummary(): DraftSummary {
  const statement = (evidenceIds: string[]) => ({
    statement: "Evidence-backed statement.",
    evidenceIds,
  });
  return {
    schemaVersion: "1.0",
    id: "draft-1",
    revision: 1,
    candidateId: "candidate-1",
    candidateRevision: 1,
    paperId: "paper-1",
    summary: {
      schemaVersion: "1.0",
      hook: "A compact hook.",
      coreProblem: statement(["private-evidence-a"]),
      novelty: [statement(["private-evidence-b"])],
      architecture: {
        overview: "A sequence encoder.",
        modelFamily: "transformer",
        parameterScale: null,
        representation: "nucleotide tokens",
        tokenization: null,
        contextLength: null,
        trainingObjectives: [],
        evidenceIds: ["private-evidence-a"],
      },
      data: {
        datasets: [
          {
            name: "Genome corpus",
            role: "pretraining",
            scale: null,
            organisms: ["human"],
            evidenceIds: ["private-evidence-a"],
          },
        ],
        benchmarks: [
          {
            name: "Enhancer benchmark",
            role: "benchmark",
            scale: null,
            organisms: ["human"],
            evidenceIds: ["private-evidence-b"],
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
          evidenceIds: ["private-evidence-a"],
        },
      ],
      takeaways: [statement(["private-evidence-b"])],
      limitations: [statement(["private-evidence-a"])],
      topics: ["dna-language-model"],
      tags: ["foundation-model"],
      organisms: ["human"],
      modalities: ["DNA"],
      links: {
        code: null,
        data: null,
        project: "https://example.org/project",
      },
      evidenceScope: "abstract-only",
    },
    evidence: {
      schemaVersion: "1.0",
      id: "evidence-paper-1",
      paperId: "paper-1",
      scope: "abstract-only",
      documents: [
        {
          id: "document-1",
          kind: "abstract",
          title: "A paper",
          sourceUrl: "https://example.org/paper",
          retrievedAt: timestamp,
          mediaType: "text/plain",
          access: "abstract-access",
          contentSha256: digest,
        },
      ],
      references: [
        {
          id: "private-evidence-a",
          documentId: "document-1",
          kind: "abstract",
          locator: { section: "Abstract" },
          text: "First private evidence.",
          textSha256: digest,
        },
        {
          id: "private-evidence-b",
          documentId: "document-1",
          kind: "abstract",
          locator: { table: "S1" },
          text: "Second private evidence.",
          textSha256: digest,
        },
      ],
      assembledAt: timestamp,
      assemblerVersion: "1.0",
      inputSha256: digest,
      warnings: [],
    },
    generation: {
      provider: "openai",
      model: "gpt-5",
      generatedAt: timestamp,
      prompt: { id: "technical-summary", version: "7", sha256: digest },
      outputSchemaVersion: "1.0",
      inputSha256: digest,
      requestId: "request-1",
      usage: { inputTokens: 1, outputTokens: 1 },
    },
    recordSha256: digest,
  };
}
