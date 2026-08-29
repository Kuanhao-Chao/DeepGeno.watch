#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { type Actor } from "@deepgeno/contracts";
import { loadPipelineConfig } from "./config.js";
import { AllowlistedHttpClient } from "./http.js";
import { createLiteratureLifecycle } from "./lifecycle.js";
import { AnthropicStructuredModel } from "./models/anthropic.js";
import { OpenAiStructuredModel } from "./models/openai.js";
import type {
  LiteratureSource,
  MetadataEnricher,
  StructuredModel,
} from "./ports.js";
import { parseCandidateReview, parseDraftReview } from "./review.js";
import { ArxivOaiSource } from "./sources/arxiv.js";
import { BioRxivSource } from "./sources/biorxiv.js";
import { CrossrefIssnSource } from "./sources/crossref.js";
import { EuropePmcEnricher } from "./sources/europe-pmc.js";
import { EuropePmcSearchSource } from "./sources/europe-pmc-search.js";
import { OpenAlexDoiEnricher } from "./sources/openalex.js";
import { GitFileStateStore } from "./store.js";
import { LiteratureError, invariant } from "./errors.js";

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseArguments(argv);
  const { projectRoot, stateRoot } = resolveCliRoots(parsed.command, {
    flags: parsed.flags,
  });
  const config = await loadPipelineConfig(projectRoot);
  const store = new GitFileStateStore(stateRoot);
  const http = new AllowlistedHttpClient({
    minimumIntervalMsByHost: {
      ...(config.arxiv.enabled
        ? {
            [new URL(config.arxiv.baseUrl).hostname]:
              config.arxiv.requestDelayMs,
          }
        : {}),
      ...(config.crossref.enabled
        ? {
            [new URL(config.crossref.baseUrl).hostname]:
              config.crossref.requestDelayMs,
          }
        : {}),
    },
  });
  const sources: LiteratureSource[] = [];
  if (config.biorxiv.enabled) {
    sources.push(
      new BioRxivSource(http, {
        overlapDays: config.biorxiv.overlapDays,
        baseUrl: config.biorxiv.baseUrl,
      }),
    );
  }
  if (config.arxiv.enabled) {
    for (const target of config.arxiv.targets) {
      sources.push(
        new ArxivOaiSource(http, {
          id: target.id,
          setSpec: target.setSpec,
          categoryPrefixes: target.categoryPrefixes,
          overlapDays: config.arxiv.overlapDays,
          baseUrl: config.arxiv.baseUrl,
        }),
      );
    }
  }
  if (config.crossref.enabled) {
    const mailto = process.env[config.crossref.mailtoEnv];
    sources.push(
      ...config.crossref.journals.map(
        ({ issn, name: journal }) =>
          new CrossrefIssnSource(http, {
            issn,
            journal,
            rows: config.crossref.cursorRows,
            overlapDays: config.crossref.overlapDays,
            baseUrl: config.crossref.baseUrl,
            ...(mailto ? { mailto } : {}),
          }),
      ),
    );
  }
  if (
    config.enrichment.europePmc.enabled &&
    config.enrichment.europePmc.discoverJournals
  ) {
    sources.push(
      new EuropePmcSearchSource(http, {
        journals: config.crossref.journals.map((journal) => journal.name),
        overlapDays: config.enrichment.europePmc.overlapDays,
        pageSize: config.enrichment.europePmc.pageSize,
        baseUrl: config.enrichment.europePmc.baseUrl,
      }),
    );
  }
  const enrichers: MetadataEnricher[] = [];
  if (config.enrichment.europePmc.enabled)
    enrichers.push(
      new EuropePmcEnricher(http, {
        baseUrl: config.enrichment.europePmc.baseUrl,
        preferOpenAccessJats: config.enrichment.europePmc.preferOpenAccessJats,
      }),
    );
  if (config.enrichment.openAlex.enabled) {
    const apiKey = process.env[config.enrichment.openAlex.apiKeyEnv];
    enrichers.push(
      new OpenAlexDoiEnricher(http, {
        ...(apiKey ? { apiKey } : {}),
        baseUrl: config.enrichment.openAlex.baseUrl,
      }),
    );
  }
  const baseOptions = {
    store,
    sources,
    enrichers,
    relevanceThreshold: config.relevanceThreshold,
    relevancePolicy: config.relevancePolicy,
  };

  let report: unknown;
  switch (parsed.command) {
    case "discover": {
      const lifecycle = createLiteratureLifecycle(baseOptions);
      report = await lifecycle.run({
        kind: "discover",
        from: requiredFlag(parsed, "from"),
        to: requiredFlag(parsed, "to"),
        trigger: triggerFlag(parsed.flags.trigger),
      });
      break;
    }
    case "apply-triage": {
      const lifecycle = createLiteratureLifecycle(baseOptions);
      const batch = await store.loadCandidateBatch(
        requiredFlag(parsed, "batch"),
      );
      const body = await readFile(requiredFlag(parsed, "body-file"), "utf8");
      const decisions = parseCandidateReview(body, batch, {
        actor: actorFlags(parsed.flags),
        decidedAt: dateTimeFlag(parsed.flags["decided-at"]),
      });
      report = await lifecycle.applyDecisions(decisions);
      break;
    }
    case "synthesize": {
      const lifecycle = createLiteratureLifecycle({
        ...baseOptions,
        model: configuredModel(),
      });
      report = await lifecycle.run({
        kind: "synthesize",
        paperId: requiredFlag(parsed, "paper"),
        ...(parsed.flags["revision-of"]
          ? { revisionOfDraftId: parsed.flags["revision-of"] }
          : {}),
      });
      break;
    }
    case "apply-draft": {
      const lifecycle = createLiteratureLifecycle(baseOptions);
      const draft = await store.loadDraft(requiredFlag(parsed, "draft"));
      const body = await readFile(requiredFlag(parsed, "body-file"), "utf8");
      const decisions = parseDraftReview(body, draft, {
        actor: actorFlags(parsed.flags),
        decidedAt: dateTimeFlag(parsed.flags["decided-at"]),
      });
      const decisionReport = await lifecycle.applyDecisions(decisions);
      const pullRequestUrl = parsed.flags["pull-request-url"];
      const commitSha = parsed.flags["merge-commit-sha"];
      const provenancePath =
        pullRequestUrl || commitSha
          ? await store.saveDraftReviewContext({
              draftId: draft.id,
              ...(pullRequestUrl ? { pullRequestUrl } : {}),
              ...(commitSha ? { commitSha } : {}),
            })
          : undefined;
      report = provenancePath
        ? {
            ...decisionReport,
            paperId: draft.paperId,
            changedPaths: [
              ...decisionReport.changedPaths,
              store.relative(provenancePath),
            ].sort(),
          }
        : { ...decisionReport, paperId: draft.paperId };
      break;
    }
    case "publish": {
      const lifecycle = createLiteratureLifecycle(baseOptions);
      report = await lifecycle.run({
        kind: "publish",
        draftId: requiredFlag(parsed, "draft"),
      });
      break;
    }
    case "project": {
      const lifecycle = createLiteratureLifecycle(baseOptions);
      const catalog = await lifecycle.project({ kind: "public-catalog" });
      invariant(
        catalog.kind === "public-catalog",
        "projection_error",
        "Unexpected projection type",
      );
      report = {
        command: "project",
        publishedCount: catalog.papers.length,
        changedPaths: [],
      };
      break;
    }
    default:
      throw new LiteratureError(
        "unknown_command",
        "Expected discover, apply-triage, synthesize, apply-draft, publish, or project",
      );
  }
  process.stdout.write(
    `${JSON.stringify({ command: parsed.command, ...(report as object) })}\n`,
  );
}

interface ParsedArguments {
  command: string;
  flags: Record<string, string | undefined>;
}

const PRIVATE_STATE_COMMANDS = new Set([
  "discover",
  "apply-triage",
  "synthesize",
  "apply-draft",
  "publish",
  "project",
]);

export function resolveCliRoots(
  command: string,
  options: {
    flags: Record<string, string | undefined>;
    environment?: NodeJS.ProcessEnv;
    cwd?: string;
  },
): { projectRoot: string; stateRoot: string } {
  const environment = options.environment ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  if (
    environment.GITHUB_ACTIONS === "true" &&
    PRIVATE_STATE_COMMANDS.has(command)
  ) {
    invariant(
      options.flags["state-root"],
      "state_root_required",
      "Private-state commands in GitHub Actions require --state-root",
    );
  }
  const projectRoot =
    options.flags["project-root"] ??
    environment.DEEPGENO_PROJECT_ROOT ??
    options.flags.root ??
    cwd;
  const stateRoot =
    options.flags["state-root"] ??
    environment.DEEPGENO_STATE_ROOT ??
    options.flags.root ??
    cwd;
  return {
    projectRoot: path.resolve(cwd, projectRoot),
    stateRoot: path.resolve(cwd, stateRoot),
  };
}

function parseArguments(argv: string[]): ParsedArguments {
  const command = argv[0] ?? "";
  const flags: Record<string, string | undefined> = {};
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--"))
      throw new LiteratureError(
        "invalid_argument",
        `Unexpected argument: ${token ?? ""}`,
      );
    const [inlineName, inlineValue] = token.slice(2).split("=", 2);
    invariant(inlineName, "invalid_argument", `Invalid flag: ${token}`);
    const value = inlineValue ?? argv[index + 1];
    invariant(
      value && !value.startsWith("--"),
      "invalid_argument",
      `Flag --${inlineName} needs a value`,
    );
    flags[inlineName] = value;
    if (inlineValue === undefined) index += 1;
  }
  return { command, flags };
}

function requiredFlag(parsed: ParsedArguments, name: string): string {
  const value = parsed.flags[name];
  invariant(value, "missing_argument", `Required flag missing: --${name}`);
  return value;
}

function actorFlags(flags: Record<string, string | undefined>): Actor {
  const id = flags["actor-id"];
  invariant(id, "missing_argument", "Required flag missing: --actor-id");
  return {
    id,
    ...(flags["actor-name"] ? { displayName: flags["actor-name"] } : {}),
    kind: "human",
  };
}

function dateTimeFlag(value: string | undefined): string {
  const result = value ? new Date(value) : new Date();
  invariant(
    !Number.isNaN(result.getTime()),
    "invalid_datetime",
    "--decided-at must be an ISO date-time",
  );
  return result.toISOString();
}

function triggerFlag(
  value: string | undefined,
): "schedule" | "manual" | "replay" | "test" {
  const trigger = value ?? "manual";
  invariant(
    ["schedule", "manual", "replay", "test"].includes(trigger),
    "invalid_trigger",
    `Invalid trigger: ${trigger}`,
  );
  return trigger as "schedule" | "manual" | "replay" | "test";
}

function configuredModel(): StructuredModel {
  const provider = process.env.DEEPGENO_MODEL_PROVIDER;
  const model = process.env.DEEPGENO_MODEL_NAME;
  invariant(
    provider === "openai" || provider === "anthropic",
    "model_provider_required",
    "DEEPGENO_MODEL_PROVIDER must be openai or anthropic",
  );
  invariant(
    model,
    "model_name_required",
    "DEEPGENO_MODEL_NAME must be configured explicitly",
  );
  const maxOutputTokens = Number(
    process.env.DEEPGENO_MODEL_MAX_OUTPUT_TOKENS ?? "5000",
  );
  invariant(
    Number.isInteger(maxOutputTokens) &&
      maxOutputTokens >= 512 &&
      maxOutputTokens <= 20_000,
    "model_token_limit_invalid",
    "DEEPGENO_MODEL_MAX_OUTPUT_TOKENS must be an integer from 512 through 20000",
  );
  if (provider === "openai") {
    invariant(
      process.env.OPENAI_API_KEY,
      "model_key_required",
      "OPENAI_API_KEY is required for the selected provider",
    );
    return new OpenAiStructuredModel({
      model,
      apiKey: process.env.OPENAI_API_KEY,
      maxOutputTokens,
    });
  }
  invariant(
    process.env.ANTHROPIC_API_KEY,
    "model_key_required",
    "ANTHROPIC_API_KEY is required for the selected provider",
  );
  return new AnthropicStructuredModel({
    model,
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxTokens: maxOutputTokens,
  });
}

const isEntrypoint =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isEntrypoint) {
  main().catch((error: unknown) => {
    const value =
      error instanceof LiteratureError
        ? { error: { code: error.code, message: error.message } }
        : {
            error: {
              code: "unexpected_error",
              message: error instanceof Error ? error.message : String(error),
            },
          };
    process.stderr.write(`${JSON.stringify(value)}\n`);
    process.exitCode = 1;
  });
}
