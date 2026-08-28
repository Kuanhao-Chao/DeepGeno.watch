import type {
  StructuredModel,
  StructuredModelRequest,
  StructuredModelResponse,
} from "../ports.js";

export class FakeStructuredModel implements StructuredModel {
  readonly provider = "fake" as const;
  readonly model: string;
  readonly #factory: (
    request: StructuredModelRequest,
  ) => unknown | Promise<unknown>;

  constructor(
    valueOrFactory:
      | unknown
      | ((request: StructuredModelRequest) => unknown | Promise<unknown>),
    model = "deterministic-fixture-v1",
  ) {
    this.model = model;
    this.#factory =
      typeof valueOrFactory === "function"
        ? (valueOrFactory as (
            request: StructuredModelRequest,
          ) => unknown | Promise<unknown>)
        : () => structuredClone(valueOrFactory);
  }

  async generate(
    request: StructuredModelRequest,
  ): Promise<StructuredModelResponse> {
    return {
      value: await this.#factory(request),
      provider: this.provider,
      model: this.model,
      responseId: "fixture-response",
    };
  }
}
