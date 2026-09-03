import { z } from "zod";

import { LiteratureError, invariant } from "../errors.js";
import type {
  StructuredModel,
  StructuredModelRequest,
  StructuredModelResponse,
} from "../ports.js";

type Fetch = typeof globalThis.fetch;

export interface CloudflareWorkersAiStructuredModelOptions {
  accountId: string;
  apiToken: string;
  model: string;
  fetch?: Fetch;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

/** Direct Workers AI REST adapter with JSON Schema output and no tools. */
export class CloudflareWorkersAiStructuredModel implements StructuredModel {
  readonly provider = "cloudflare-workers-ai" as const;
  readonly model: string;
  readonly #accountId: string;
  readonly #apiToken: string;
  readonly #fetch: Fetch;
  readonly #maxOutputTokens: number;
  readonly #timeoutMs: number;

  constructor(options: CloudflareWorkersAiStructuredModelOptions) {
    invariant(
      /^[a-f0-9]{32}$/i.test(options.accountId),
      "cloudflare_account_id_invalid",
      "CLOUDFLARE_ACCOUNT_ID must be a 32-character hexadecimal account ID",
    );
    invariant(
      options.apiToken.trim(),
      "model_key_required",
      "CLOUDFLARE_AI_API_TOKEN is required for the selected provider",
    );
    invariant(
      /^@cf\/[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(options.model),
      "model_required",
      "Cloudflare Workers AI requires an explicit @cf/provider/model name",
    );
    this.#accountId = options.accountId;
    this.#apiToken = options.apiToken;
    this.model = options.model;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#maxOutputTokens = options.maxOutputTokens ?? 5_000;
    this.#timeoutMs = options.timeoutMs ?? 120_000;
  }

  async generate(
    request: StructuredModelRequest,
  ): Promise<StructuredModelResponse> {
    let response: Response;
    try {
      response = await this.#fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.#accountId}/ai/run/${this.model}`,
        {
          method: "POST",
          headers: {
            accept: "application/json",
            authorization: `Bearer ${this.#apiToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            messages: [
              { role: "system", content: request.system },
              { role: "user", content: request.prompt },
            ],
            response_format: {
              type: "json_schema",
              json_schema: z.toJSONSchema(request.outputSchema, {
                target: "draft-7",
                unrepresentable: "throw",
              }),
            },
            max_tokens: this.#maxOutputTokens,
            temperature: 0,
            stream: false,
            store: false,
          }),
          redirect: "error",
          signal: AbortSignal.timeout(this.#timeoutMs),
        },
      );
    } catch {
      throw new LiteratureError(
        "model_request_failed",
        "Cloudflare Workers AI request failed before receiving a response",
      );
    }
    if (!response.ok) {
      throw new LiteratureError(
        "model_request_failed",
        `Cloudflare Workers AI request failed with HTTP ${response.status}`,
      );
    }

    let envelope: unknown;
    try {
      envelope = await response.json();
    } catch {
      throw new LiteratureError(
        "model_invalid_response",
        "Cloudflare Workers AI returned an invalid response envelope",
      );
    }
    const result = cloudflareResult(envelope);
    let value: unknown;
    try {
      const candidate =
        typeof result.response === "string"
          ? JSON.parse(result.response)
          : result.response;
      value = request.outputSchema.parse(candidate);
    } catch {
      throw new LiteratureError(
        "model_invalid_output",
        "Cloudflare Workers AI returned invalid structured output",
      );
    }
    const usage = tokenUsage(result.usage);
    return {
      value,
      provider: this.provider,
      model: this.model,
      ...(result.responseId ? { responseId: result.responseId } : {}),
      ...(usage ? { usage } : {}),
    };
  }
}

function cloudflareResult(value: unknown): {
  response: unknown;
  usage?: unknown;
  responseId?: string;
} {
  invariant(
    isRecord(value) && value.success === true && isRecord(value.result),
    "model_invalid_response",
    "Cloudflare Workers AI returned an invalid response envelope",
  );
  if ("response" in value.result) {
    return {
      response: value.result.response,
      ...(value.result.usage !== undefined
        ? { usage: value.result.usage }
        : {}),
      ...(typeof value.result.id === "string"
        ? { responseId: value.result.id }
        : {}),
    };
  }
  const firstChoice = Array.isArray(value.result.choices)
    ? value.result.choices[0]
    : undefined;
  invariant(
    isRecord(firstChoice) &&
      isRecord(firstChoice.message) &&
      typeof firstChoice.message.content === "string",
    "model_empty_output",
    "Cloudflare Workers AI returned no structured output",
  );
  return {
    response: firstChoice.message.content,
    ...(value.result.usage !== undefined ? { usage: value.result.usage } : {}),
    ...(typeof value.result.id === "string"
      ? { responseId: value.result.id }
      : {}),
  };
}

function tokenUsage(
  value: unknown,
): StructuredModelResponse["usage"] | undefined {
  if (
    !isRecord(value) ||
    !Number.isInteger(value.prompt_tokens) ||
    !Number.isInteger(value.completion_tokens) ||
    Number(value.prompt_tokens) < 0 ||
    Number(value.completion_tokens) < 0
  ) {
    return undefined;
  }
  return {
    inputTokens: Number(value.prompt_tokens),
    outputTokens: Number(value.completion_tokens),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
