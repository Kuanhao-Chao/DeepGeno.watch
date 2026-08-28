import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadPipelineConfig } from "./config.js";

describe("production pipeline configuration", () => {
  it("uses narrow arXiv sets and the computational relevance gate", async () => {
    const root = fileURLToPath(new URL("../../..", import.meta.url));
    const config = await loadPipelineConfig(root);

    expect(config.arxiv.targets).toEqual([
      {
        id: "q-bio",
        setSpec: "q-bio",
        categoryPrefixes: ["q-bio."],
      },
      {
        id: "cs",
        setSpec: "cs:cs:LG",
        categoryPrefixes: ["cs.LG"],
      },
      {
        id: "stat",
        setSpec: "stat:stat:ML",
        categoryPrefixes: ["stat.ML"],
      },
    ]);
    expect(config.relevancePolicy.requireComputationalSignal).toBe(true);
    expect(config.relevanceThreshold).toBe(0.35);
  });
});
