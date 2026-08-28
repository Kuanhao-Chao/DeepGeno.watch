import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "zod";

const nonEmpty = z.string().trim().min(1);
const digest = z.string().regex(/^[a-f0-9]{64}$/i);
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

const statement = z.object({
  statement: nonEmpty,
  evidenceIds: z.array(nonEmpty).min(1),
});

const locator = z.object({
  section: nonEmpty.optional(),
  paragraph: z.number().int().positive().optional(),
  page: z.number().int().positive().optional(),
  figure: nonEmpty.optional(),
  table: nonEmpty.optional(),
});

const citation = z.object({
  id: nonEmpty,
  documentKind: z.enum(["abstract", "jats", "html", "pdf", "supplement"]),
  sourceUrl: z.url(),
  locator,
  contentSha256: digest,
});

const dataset = z.object({
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
  evidenceIds: z.array(nonEmpty).min(1),
});

const result = z.object({
  claim: nonEmpty,
  metric: nonEmpty.nullable(),
  value: nonEmpty.nullable(),
  baseline: nonEmpty.nullable(),
  delta: nonEmpty.nullable(),
  benchmark: nonEmpty.nullable(),
  evidenceIds: z.array(nonEmpty).min(1),
});

const actor = z.object({
  id: nonEmpty,
  displayName: nonEmpty.optional(),
  kind: z.enum(["human", "automation"]),
});

const paperSchema = z.object({
  schemaVersion: z.literal("1.0"),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  paperId: nonEmpty,
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
  hook: nonEmpty,
  priority,
  progress,
  tags: z.array(nonEmpty).min(1),
  topics: z.array(topic).min(1),
  organisms: z.array(nonEmpty),
  modalities: z.array(nonEmpty),
  evidence: z.object({
    scope: evidenceScope,
    fullTextAvailable: z.boolean(),
    sources: z.array(citation).min(1),
  }),
  coreProblem: statement,
  novelty: z.array(statement).min(1),
  architecture: z.object({
    overview: nonEmpty,
    modelFamily: nonEmpty.nullable(),
    parameterScale: nonEmpty.nullable(),
    representation: nonEmpty.nullable(),
    tokenization: nonEmpty.nullable(),
    contextLength: nonEmpty.nullable(),
    trainingObjectives: z.array(nonEmpty),
    evidenceIds: z.array(nonEmpty).min(1),
  }),
  datasets: z.array(dataset),
  benchmarks: z.array(dataset),
  results: z.array(result),
  takeaways: z.array(statement).min(1),
  limitations: z.array(statement),
  provenance: z.object({
    generation: z.object({
      provider: z.enum(["openai", "anthropic"]),
      model: nonEmpty,
      generatedAt: z.coerce.date(),
      prompt: z.object({
        id: nonEmpty,
        version: nonEmpty,
        sha256: digest,
      }),
      outputSchemaVersion: z.literal("1.0"),
      inputSha256: digest,
      requestId: nonEmpty.optional(),
      usage: z
        .object({
          inputTokens: z.number().int().nonnegative(),
          outputTokens: z.number().int().nonnegative(),
        })
        .optional(),
    }),
    review: z.object({
      draftId: nonEmpty,
      draftRevision: z.number().int().positive(),
      approvedAt: z.coerce.date(),
      approvedBy: actor,
      pullRequestUrl: z.url().optional(),
      commitSha: z
        .string()
        .regex(/^[a-f0-9]{7,64}$/i)
        .optional(),
    }),
  }),
});

const papers = defineCollection({
  loader: glob({
    base: "../../content/public/papers",
    pattern: "**/*.md",
  }),
  schema: paperSchema,
});

export const collections = { papers };
