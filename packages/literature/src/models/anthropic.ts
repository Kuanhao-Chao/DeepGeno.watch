import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { LiteratureError, invariant } from "../errors.js";
import type {
  StructuredModel,
  StructuredModelRequest,
  StructuredModelResponse,
} from "../ports.js";

export interface AnthropicStructuredModelOptions {
  model: string;
  apiKey?: string;
  client?: Anthropic;
  maxTokens?: number;
}

/** Anthropic Messages adapter with output_config JSON schema and no tools. */
export class AnthropicStructuredModel implements StructuredModel {
  readonly provider = "anthropic" as const;
  readonly model: string;
  readonly #client: Anthropic;
  readonly #maxTokens: number;

  constructor(options: AnthropicStructuredModelOptions) {
    invariant(
      options.model.trim(),
      "model_required",
      "ANTHROPIC_MODEL must be configured explicitly",
    );
    this.model = options.model;
    this.#client = options.client ?? new Anthropic({ apiKey: options.apiKey });
    this.#maxTokens = options.maxTokens ?? 5_000;
  }

  async generate(
    request: StructuredModelRequest,
  ): Promise<StructuredModelResponse> {
    const response = await this.#client.messages.parse({
      model: this.model,
      max_tokens: this.#maxTokens,
      system: request.system,
      messages: [{ role: "user", content: request.prompt }],
      output_config: {
        format: zodOutputFormat(request.outputSchema),
      },
    });
    if (
      response.parsed_output === null ||
      response.parsed_output === undefined
    ) {
      throw new LiteratureError(
        "model_empty_output",
        "Anthropic returned no structured output",
      );
    }
    return {
      value: response.parsed_output,
      provider: this.provider,
      model: this.model,
      responseId: response.id,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
