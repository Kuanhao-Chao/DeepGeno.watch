import { LiteratureError, invariant } from "./errors.js";

export const DEFAULT_SOURCE_HOSTS = [
  "api.biorxiv.org",
  "export.arxiv.org",
  "api.crossref.org",
  "www.ebi.ac.uk",
  "api.openalex.org",
] as const;

export interface HttpClientOptions {
  allowedHosts?: readonly string[];
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
  userAgent?: string;
}

/** A deliberately small outbound capability shared by all source adapters. */
export class AllowlistedHttpClient {
  readonly #allowedHosts: ReadonlySet<string>;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  readonly #maxResponseBytes: number;
  readonly #userAgent: string;

  constructor(options: HttpClientOptions = {}) {
    this.#allowedHosts = new Set(options.allowedHosts ?? DEFAULT_SOURCE_HOSTS);
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#timeoutMs = options.timeoutMs ?? 20_000;
    this.#maxResponseBytes = options.maxResponseBytes ?? 8_000_000;
    this.#userAgent =
      options.userAgent ??
      "DeepGeno.watch/0.1 (+https://deepgeno.watch/methodology/)";
  }

  async getText(url: URL | string, headers: HeadersInit = {}): Promise<string> {
    const target = typeof url === "string" ? new URL(url) : url;
    this.assertAllowed(target);

    const response = await this.#fetch(target, {
      method: "GET",
      headers: {
        Accept: "application/json, application/xml, text/xml, text/plain",
        "User-Agent": this.#userAgent,
        ...headers,
      },
      redirect: "error",
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    if (!response.ok) {
      throw new LiteratureError(
        "source_http_error",
        `${target.hostname} returned ${response.status} ${response.statusText}`,
      );
    }
    const advertisedLength = Number(response.headers.get("content-length"));
    if (
      Number.isFinite(advertisedLength) &&
      advertisedLength > this.#maxResponseBytes
    ) {
      throw new LiteratureError(
        "source_too_large",
        `${target.hostname} response exceeds size limit`,
      );
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > this.#maxResponseBytes) {
      throw new LiteratureError(
        "source_too_large",
        `${target.hostname} response exceeds size limit`,
      );
    }
    return new TextDecoder().decode(bytes);
  }

  async getJson<T>(url: URL | string, headers: HeadersInit = {}): Promise<T> {
    const text = await this.getText(url, {
      Accept: "application/json",
      ...headers,
    });
    try {
      return JSON.parse(text) as T;
    } catch (error) {
      throw new LiteratureError(
        "source_invalid_json",
        "Source returned invalid JSON",
        { cause: error },
      );
    }
  }

  assertAllowed(url: URL): void {
    invariant(
      url.protocol === "https:",
      "source_protocol_denied",
      "Only HTTPS source URLs are allowed",
    );
    invariant(
      this.#allowedHosts.has(url.hostname),
      "source_host_denied",
      `Outbound host is not allowlisted: ${url.hostname}`,
    );
    invariant(
      !url.username && !url.password,
      "source_credentials_denied",
      "Credentials in source URLs are denied",
    );
  }
}
