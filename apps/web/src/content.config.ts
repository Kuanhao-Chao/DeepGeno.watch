import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "zod";

const nonEmpty = z.string().trim().min(1);
const publicEvidenceId = z.string().regex(/^e[1-9][0-9]*$/);
const publicEvidenceIds = z.array(publicEvidenceId).min(1);
const evidenceScope = z.enum([
  "abstract-only",
  "partial-full-text",
  "full-text",
]);
const priority = z.enum(["must-read", "recommended", "notable"]);
const progress = z.enum(["queued", "skimmed", "read"]);
const topic = z.enum([
  "sequence-to-function",
  "dna-language-model",
  "rna-language-model",
  "protein-language-model",
  "variant-effect-prediction",
  "gene-regulation",
  "epigenomics",
  "single-cell-deep-learning",
  "structural-bioinformatics",
]);

const statement = z
  .object({
    statement: nonEmpty,
    evidenceIds: publicEvidenceIds,
  })
  .strict();

const locator = z
  .object({
    section: nonEmpty.optional(),
    paragraph: z.number().int().positive().optional(),
    page: z.number().int().positive().optional(),
    figure: nonEmpty.optional(),
    table: nonEmpty.optional(),
  })
  .strict();

const citation = z
  .object({
    id: publicEvidenceId,
    documentKind: z.enum(["abstract", "jats", "html", "pdf", "supplement"]),
    sourceUrl: z.url(),
    locator,
  })
  .strict();

const dataset = z
  .object({
    name: nonEmpty,
    role: z.enum([
      "pretraining",
      "fine-tuning",
      "validation",
      "testing",
      "benchmark",
    ]),
    scale: nonEmpty.nullable(),
    organisms: z.array(nonEmpty),
    evidenceIds: publicEvidenceIds,
  })
  .strict();

const result = z
  .object({
    claim: nonEmpty,
    metric: nonEmpty.nullable(),
    value: nonEmpty.nullable(),
    baseline: nonEmpty.nullable(),
    delta: nonEmpty.nullable(),
    benchmark: nonEmpty.nullable(),
    evidenceIds: publicEvidenceIds,
  })
  .strict();

const paperSchema = z
  .object({
    schemaVersion: z.literal("2.0"),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: nonEmpty,
    authors: z.array(nonEmpty).min(1),
    publicationDate: z.coerce.date().optional(),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    source: z.enum(["biorxiv", "arxiv", "crossref", "europe-pmc", "openalex"]),
    venue: nonEmpty.optional(),
    doi: nonEmpty.optional(),
    url: z.url(),
    pdfUrl: z.url().optional(),
    codeUrl: z.url().optional(),
    dataUrl: z.url().optional(),
    projectUrl: z.url().optional(),
    hook: nonEmpty,
    priority,
    progress,
    tags: z.array(nonEmpty).min(1),
    topics: z.array(topic).min(1),
    organisms: z.array(nonEmpty),
    modalities: z.array(nonEmpty),
    evidence: z
      .object({
        scope: evidenceScope,
        fullTextAvailable: z.boolean(),
        sources: z.array(citation).min(1),
      })
      .strict(),
    coreProblem: statement,
    novelty: z.array(statement).min(1),
    architecture: z
      .object({
        overview: nonEmpty,
        modelFamily: nonEmpty.nullable(),
        parameterScale: nonEmpty.nullable(),
        representation: nonEmpty.nullable(),
        tokenization: nonEmpty.nullable(),
        contextLength: nonEmpty.nullable(),
        trainingObjectives: z.array(nonEmpty),
        evidenceIds: publicEvidenceIds,
      })
      .strict(),
    datasets: z.array(dataset),
    benchmarks: z.array(dataset),
    results: z.array(result),
    takeaways: z.array(statement).min(1),
    limitations: z.array(statement),
    provenance: z
      .object({
        generation: z
          .object({
            provider: z.enum(["openai", "anthropic"]),
            model: nonEmpty,
            generatedAt: z.coerce.date(),
            prompt: z
              .object({
                id: nonEmpty,
                version: nonEmpty,
              })
              .strict(),
            outputSchemaVersion: z.literal("1.0"),
          })
          .strict(),
        review: z
          .object({
            approvedAt: z.coerce.date(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict()
  .superRefine((paper, context) => {
    const sourceIds = new Set<string>();
    paper.evidence.sources.forEach((source, index) => {
      if (sourceIds.has(source.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate public evidence source: ${source.id}`,
          path: ["evidence", "sources", index, "id"],
        });
      }
      sourceIds.add(source.id);
    });

    const references: Array<{ ids: string[]; path: (string | number)[] }> = [
      {
        ids: paper.coreProblem.evidenceIds,
        path: ["coreProblem", "evidenceIds"],
      },
      ...paper.novelty.map((entry, index) => ({
        ids: entry.evidenceIds,
        path: ["novelty", index, "evidenceIds"],
      })),
      {
        ids: paper.architecture.evidenceIds,
        path: ["architecture", "evidenceIds"],
      },
      ...paper.datasets.map((entry, index) => ({
        ids: entry.evidenceIds,
        path: ["datasets", index, "evidenceIds"],
      })),
      ...paper.benchmarks.map((entry, index) => ({
        ids: entry.evidenceIds,
        path: ["benchmarks", index, "evidenceIds"],
      })),
      ...paper.results.map((entry, index) => ({
        ids: entry.evidenceIds,
        path: ["results", index, "evidenceIds"],
      })),
      ...paper.takeaways.map((entry, index) => ({
        ids: entry.evidenceIds,
        path: ["takeaways", index, "evidenceIds"],
      })),
      ...paper.limitations.map((entry, index) => ({
        ids: entry.evidenceIds,
        path: ["limitations", index, "evidenceIds"],
      })),
    ];
    references.forEach(({ ids, path }) => {
      ids.forEach((id, index) => {
        if (!sourceIds.has(id)) {
          context.addIssue({
            code: "custom",
            message: `Public summary cites unknown evidence: ${id}`,
            path: [...path, index],
          });
        }
      });
    });
  });

const papers = defineCollection({
  loader: glob({
    base: "../../content/public/papers",
    pattern: "**/*.md",
  }),
  schema: paperSchema,
});

export const collections = { papers };
