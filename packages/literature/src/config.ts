import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import type { RelevancePolicy } from "./processing.js";

const nonEmpty = z.string().trim().min(1);
const httpsUrl = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:");

const bioRxivSchema = z.object({
  id: nonEmpty,
  kind: z.literal("biorxiv"),
  enabled: z.boolean(),
  baseUrl: httpsUrl,
  overlapDays: z.number().int().nonnegative(),
});

const arxivSchema = z.object({
  id: nonEmpty,
  kind: z.literal("arxiv-oai"),
  enabled: z.boolean(),
  baseUrl: httpsUrl,
  sets: z.array(z.enum(["q-bio", "cs", "stat"])).min(1),
  categories: z.array(nonEmpty).min(1),
  overlapDays: z.number().int().nonnegative(),
  requestDelayMs: z.number().int().nonnegative(),
});

const crossrefSchema = z.object({
  id: nonEmpty,
  kind: z.literal("crossref"),
  enabled: z.boolean(),
  baseUrl: httpsUrl,
  mailtoEnv: nonEmpty,
  cursorRows: z.number().int().min(1).max(1_000),
  overlapDays: z.number().int().nonnegative(),
  requestDelayMs: z.number().int().nonnegative(),
  journals: z.array(z.object({ name: nonEmpty, issn: nonEmpty })).min(1),
});

const enrichmentSchema = z.object({
  europePmc: z.object({
    enabled: z.boolean(),
    baseUrl: httpsUrl,
    preferOpenAccessJats: z.boolean(),
    discoverJournals: z.boolean(),
    pageSize: z.number().int().min(1).max(1_000),
    overlapDays: z.number().int().nonnegative(),
  }),
  openAlex: z.object({
    enabled: z.boolean(),
    baseUrl: httpsUrl,
    singletonDoiOnly: z.literal(true),
    apiKeyEnv: nonEmpty,
  }),
});

const taxonomySchema = z.object({
  version: z.union([z.string(), z.number()]),
  topics: z.record(
    nonEmpty,
    z.object({ label: nonEmpty, phrases: z.array(nonEmpty).min(1) }),
  ),
});

const relevanceSchema = z.object({
  version: z.union([z.string(), z.number()]),
  candidateThreshold: z.number().min(0).max(1),
  positiveSignals: z.object({
    architecture: z.array(nonEmpty),
    genomics: z.array(nonEmpty),
  }),
  negativeSignals: z.array(nonEmpty),
});

export interface PipelineConfig {
  biorxiv: z.infer<typeof bioRxivSchema>;
  arxiv: z.infer<typeof arxivSchema>;
  crossref: z.infer<typeof crossrefSchema>;
  enrichment: z.infer<typeof enrichmentSchema>;
  relevanceThreshold: number;
  relevancePolicy: RelevancePolicy;
}

export async function loadPipelineConfig(
  root: string,
): Promise<PipelineConfig> {
  const [biorxiv, arxiv, crossref, enrichment, taxonomy, relevance] =
    await Promise.all([
      readYaml(path.join(root, "config/sources/biorxiv.yaml"), bioRxivSchema),
      readYaml(path.join(root, "config/sources/arxiv.yaml"), arxivSchema),
      readYaml(path.join(root, "config/sources/crossref.yaml"), crossrefSchema),
      readYaml(
        path.join(root, "config/sources/enrichment.yaml"),
        enrichmentSchema,
      ),
      readYaml(path.join(root, "config/taxonomy.yaml"), taxonomySchema),
      readYaml(path.join(root, "config/relevance.yaml"), relevanceSchema),
    ]);

  return {
    biorxiv,
    arxiv,
    crossref,
    enrichment,
    relevanceThreshold: relevance.candidateThreshold,
    relevancePolicy: {
      topicTerms: Object.fromEntries(
        Object.entries(taxonomy.topics).map(([topic, definition]) => [
          topic,
          definition.phrases,
        ]),
      ),
      architectureSignals: relevance.positiveSignals.architecture,
      genomicsSignals: relevance.positiveSignals.genomics,
      negativeSignals: relevance.negativeSignals,
    },
  };
}

async function readYaml<T>(target: string, schema: z.ZodType<T>): Promise<T> {
  const document = YAML.parse(await readFile(target, "utf8")) as unknown;
  return schema.parse(document);
}
