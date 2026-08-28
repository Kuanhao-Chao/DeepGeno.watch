import { LiteratureError, invariant } from "./errors.js";

export const DEFAULT_SOURCE_HOSTS = [
  "api.biorxiv.org",
  "export.arxiv.org",
  "oaipmh.arxiv.org",
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
  minimumIntervalMsByHost?: Readonly<Record<string, number>>;
}

/** A deliberately small outbound capability shared by all source adapters. */
export class AllowlistedHttpClient {
  readonly #allowedHosts: ReadonlySet<string>;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  readonly #maxResponseBytes: number;
  readonly #userAgent: string;
  readonly #minimumIntervalMsByHost: ReadonlyMap<string, number>;
  readonly #hostQueues = new Map<string, Promise<void>>();
  readonly #nextAllowedAt = new Map<string, number>();

  constructor(options: HttpClientOptions = {}) {
    this.#allowedHosts = new Set(options.allowedHosts ?? DEFAULT_SOURCE_HOSTS);
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#timeoutMs = options.timeoutMs ?? 20_000;
    this.#maxResponseBytes = options.maxResponseBytes ?? 8_000_000;
    this.#userAgent =
      options.userAgent ??
      "DeepGeno.watch/0.1 (+https://deepgeno.watch/methodology/)";
    this.#minimumIntervalMsByHost = new Map(
      Object.entries(options.minimumIntervalMsByHost ?? {}).map(
        ([host, milliseconds]) => {
          invariant(
            Number.isFinite(milliseconds) && milliseconds >= 0,
            "source_rate_limit_invalid",
            `Invalid request interval for ${host}`,
          );
          return [host, milliseconds] as const;
        },
      ),
    );
  }

  async getText(url: URL | string, headers: HeadersInit = {}): Promise<string> {
    const target = typeof url === "string" ? new URL(url) : url;
    this.assertAllowed(target);

    const response = await this.#requestWithRetry(target, headers);
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

  async #requestWithRetry(
    target: URL,
    headers: HeadersInit,
  ): Promise<Response> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await this.#pace(target.hostname);
      let response: Response;
      try {
        response = await this.#fetch(target, {
          method: "GET",
          headers: {
            Accept: "application/json, application/xml, text/xml, text/plain",
            "User-Agent": this.#userAgent,
            ...headers,
          },
          redirect: "error",
          signal: AbortSignal.timeout(this.#timeoutMs),
        });
      } catch (error) {
        if (attempt === maxAttempts) throw error;
        await delay(retryDelay(undefined, attempt));
        continue;
      }
      if (!retryableStatus(response.status) || attempt === maxAttempts) {
        return response;
      }
      if (response.body) await response.body.cancel().catch(() => undefined);
      await delay(retryDelay(response.headers.get("retry-after"), attempt));
    }
    throw new Error("HTTP retry loop exhausted unexpectedly");
  }

  async #pace(hostname: string): Promise<void> {
    const interval = this.#minimumIntervalMsByHost.get(hostname) ?? 0;
    if (interval === 0) return;
    const prior = this.#hostQueues.get(hostname) ?? Promise.resolve();
    const turn = prior
      .catch(() => undefined)
      .then(async () => {
        const wait = Math.max(
          0,
          (this.#nextAllowedAt.get(hostname) ?? 0) - Date.now(),
        );
        if (wait > 0) await delay(wait);
        this.#nextAllowedAt.set(hostname, Date.now() + interval);
      });
    this.#hostQueues.set(hostname, turn);
    try {
      await turn;
    } finally {
      if (this.#hostQueues.get(hostname) === turn)
        this.#hostQueues.delete(hostname);
    }
  }
}

function retryableStatus(status: number): boolean {
  return new Set([408, 425, 429, 500, 502, 503, 504]).has(status);
}

function retryDelay(retryAfter: string | undefined | null, attempt: number) {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0)
      return Math.min(seconds * 1_000, 30_000);
    const instant = Date.parse(retryAfter);
    if (Number.isFinite(instant))
      return Math.min(Math.max(0, instant - Date.now()), 30_000);
  }
  return 250 * 2 ** (attempt - 1);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
