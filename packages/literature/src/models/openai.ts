import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { LiteratureError, invariant } from "../errors.js";
import type {
  StructuredModel,
  StructuredModelRequest,
  StructuredModelResponse,
} from "../ports.js";

export interface OpenAiStructuredModelOptions {
  model: string;
  apiKey?: string;
  client?: OpenAI;
  maxOutputTokens?: number;
}

/** OpenAI Responses adapter with strict Structured Outputs and no tools. */
export class OpenAiStructuredModel implements StructuredModel {
  readonly provider = "openai" as const;
  readonly model: string;
  readonly #client: OpenAI;
  readonly #maxOutputTokens: number;

  constructor(options: OpenAiStructuredModelOptions) {
    invariant(
      options.model.trim(),
      "model_required",
      "OPENAI_MODEL must be configured explicitly",
    );
    this.model = options.model;
    this.#client = options.client ?? new OpenAI({ apiKey: options.apiKey });
    this.#maxOutputTokens = options.maxOutputTokens ?? 5_000;
  }

  async generate(
    request: StructuredModelRequest,
  ): Promise<StructuredModelResponse> {
    const response = await this.#client.responses.parse(
      {
        model: this.model,
        input: [
          { role: "system", content: request.system },
          { role: "user", content: request.prompt },
        ],
        text: {
          format: zodTextFormat(request.outputSchema, request.schemaName),
        },
        store: false,
        max_output_tokens: this.#maxOutputTokens,
      },
      request.idempotencyKey
        ? { idempotencyKey: request.idempotencyKey }
        : undefined,
    );
    if (
      response.output_parsed === null ||
      response.output_parsed === undefined
    ) {
      throw new LiteratureError(
        "model_empty_output",
        "OpenAI returned no structured output",
      );
    }
    return {
      value: response.output_parsed,
      provider: this.provider,
      model: this.model,
      responseId: response.id,
      ...(response.usage
        ? {
            usage: {
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
            },
          }
        : {}),
    };
  }
}
