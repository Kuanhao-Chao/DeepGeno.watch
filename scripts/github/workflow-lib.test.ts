import { describe, expect, it } from "vitest";

import {
  assertPrivateRepository,
  extractReviewId,
  parseJsonLine,
  relevantPullRequestKind,
  resolveDiscoveryWindows,
  validateChangedPaths,
  validateModelEnvironment,
  validateSelectedPaperLimit,
} from "./workflow-lib.mjs";

describe("GitHub literature workflow boundaries", () => {
  it("rejects review automation in a public repository", () => {
    expect(() =>
      assertPrivateRepository({ repository: { private: false } }),
    ).toThrow(/private GitHub repository/);
  });

  it("recognizes exactly one review label", () => {
    expect(
      relevantPullRequestKind({
        pull_request: { labels: [{ name: "literature-inbox" }] },
      }),
    ).toBe("candidate");
    expect(() =>
      relevantPullRequestKind({
        pull_request: {
          labels: [{ name: "literature-inbox" }, { name: "summary-review" }],
        },
      }),
    ).toThrow(/cannot carry both/);
  });

  it("requires one unambiguous immutable marker", () => {
    expect(
      extractReviewId(
        '<!-- deepgeno:candidate-batch id="batch-1" revision="2" -->',
        "candidate",
      ),
    ).toEqual({ id: "batch-1", revision: 2 });
    expect(() =>
      extractReviewId(
        '<!-- deepgeno:draft id="draft-1" revision="1" -->\n<!-- deepgeno:draft id="draft-2" revision="1" -->',
        "summary",
      ),
    ).toThrow(/exactly one/);
  });

  it("chunks a bounded 90-day backfill without gaps", () => {
    expect(
      resolveDiscoveryWindows({
        backfillDays: 90,
        now: new Date("2026-08-27T16:00:00Z"),
        maxWindowDays: 30,
      }),
    ).toEqual([
      { from: "2026-05-30", through: "2026-06-28" },
      { from: "2026-06-29", through: "2026-07-28" },
      { from: "2026-07-29", through: "2026-08-27" },
    ]);
  });

  it("uses the Los Angeles calendar date for scheduled discovery", () => {
    expect(
      resolveDiscoveryWindows({ now: new Date("2026-08-28T05:00:00Z") }),
    ).toEqual([{ from: "2026-08-27", through: "2026-08-27" }]);
  });

  it("confines mutation paths to explicitly allowed projections", () => {
    expect(
      validateChangedPaths(["data/private/batches/a.json"], ["data/private/"]),
    ).toEqual(["data/private/batches/a.json"]);
    expect(() =>
      validateChangedPaths(
        ["apps/web/src/pages/index.astro"],
        ["data/private/"],
      ),
    ).toThrow(/out-of-scope/);
    expect(() =>
      validateChangedPaths(["../secret"], ["data/private/"]),
    ).toThrow(/Unsafe relative path/);
  });

  it("selects one configured model provider without fallback", () => {
    expect(
      validateModelEnvironment({
        DEEPGENO_MODEL_PROVIDER: "openai",
        DEEPGENO_MODEL_NAME: "explicit-model",
        OPENAI_API_KEY: "test-key",
      }),
    ).toEqual({
      provider: "openai",
      model: "explicit-model",
      selectedKey: "OPENAI_API_KEY",
      maxOutputTokens: 5000,
    });
    expect(() =>
      validateModelEnvironment({
        DEEPGENO_MODEL_PROVIDER: "openai",
        DEEPGENO_MODEL_NAME: "explicit-model",
        ANTHROPIC_API_KEY: "wrong-key",
      }),
    ).toThrow(/OPENAI_API_KEY/);
  });

  it("bounds summary fan-out before any model jobs start", () => {
    expect(validateSelectedPaperLimit(["paper-1", "paper-2"], "2")).toBe(2);
    expect(() =>
      validateSelectedPaperLimit(["paper-1", "paper-2"], "1"),
    ).toThrow(/exceeding the per-run limit/);
    expect(() => validateSelectedPaperLimit(["paper-1"], "0")).toThrow(
      /integer from 1/,
    );
  });

  it("parses only the expected CLI result object", () => {
    expect(
      parseJsonLine(
        'npm note\n{"command":"discover","candidateCount":2}\n',
        "discover",
      ),
    ).toMatchObject({ candidateCount: 2 });
    expect(() => parseJsonLine('{"command":"publish"}', "discover")).toThrow(
      /Expected literature command/,
    );
  });
});
