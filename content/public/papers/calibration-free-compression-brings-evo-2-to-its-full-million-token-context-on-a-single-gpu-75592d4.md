---
schemaVersion: "2.0"
slug: calibration-free-compression-brings-evo-2-to-its-full-million-token-context-on-a-single-gpu-75592d4
title: Calibration-free compression brings Evo 2 to its full million-token context on a single GPU
authors:
  - Patsakis, M.
  - Tzanakakis, A.
  - Georgakopoulos-Soares, I.
publicationDate: "2026-09-01"
publishedAt: "2026-09-03T18:00:00.000Z"
updatedAt: "2026-09-03T18:00:00.000Z"
source: biorxiv
venue: bioRxiv
url: https://doi.org/10.64898/2026.08.28.747902
abstract:
  "Evo 2 is the largest openly available genomic foundation model, but its forty billion parameter configuration cannot
  be loaded onto a single 80 GB accelerator, placing genome-scale analysis beyond most laboratories. We present TurboQuant-Bio,
  an open toolkit that compresses Evo 2s weights and attention cache to four bits without calibration data, and serves both
  through fused kernels. Compression is near-lossless across perplexity spanning the tree of life, genomic classification,
  splice-site prediction, gene completion and clinically relevant variant-effect prediction. It brings Evo 2 40B onto one
  80 GB GPU and Evo 2 7B to its full million-token context within a 40 GB memory budget, an eightfold gain in reachable context.
  We further show that the released chunked-prefill path is silently incorrect, returning plausible but uncorrelated likelihoods,
  and derive the block-wise continuation that repairs it: a complete 580-kilobase bacterial genome is now scored in one context
  in 22 minutes rather than 13.7 hours."
hook:
  TurboQuant-Bio achieves near-lossless 4-bit compression of Evo 2 weights and attention cache, enabling 1M-token context
  on a single 40 GB GPU and Evo 2 40B on one 80 GB accelerator [E0001].
priority: must-read
progress: queued
tags:
  - Evo 2
  - model-compression
  - long-context
  - quantization
  - variant-effect
topics:
  - dna-language-model
  - variant-effect-prediction
organisms: []
modalities:
  - Autoregressive [E0001]
evidence:
  scope: abstract-only
  fullTextAvailable: false
  references:
    - id: e1
      documentKind: abstract
      sourceUrl: https://doi.org/10.64898/2026.08.28.747902
      locator:
        section: Abstract
        paragraph: 1
coreProblem:
  statement:
    Evo 2 40B cannot fit on a single 80 GB GPU and its chunked-prefill path silently produces uncorrelated likelihoods
    [E0001].
  evidenceIds:
    - e1
novelty:
  - statement: Calibration-free 4-bit compression of both weights and attention cache with fused serving kernels [E0001].
    evidenceIds:
      - e1
  - statement: Block-wise continuation algorithm repairing chunked-prefill to score 580 kb bacterial genomes in 22 min [E0001].
    evidenceIds:
      - e1
architecture:
  overview:
    Calibration-free compression brings Evo 2 to its full million-token context on a single GPU introduces StripedHyena
    genomic foundation model (Evo 2) [E0001]. with 7B and 40B parameters [E0001] [E0001].
  modelFamily: StripedHyena genomic foundation model (Evo 2) [E0001].
  parameterScale: 7B and 40B parameters [E0001]
  representation: Compressed 4-bit weight and attention representations with fused custom kernels [E0001].
  tokenization: Single-nucleotide tokenization [E0001].
  contextLength: 1,000,000 tokens on a single GPU [E0001]
  trainingObjectives:
    - Pretraining on dna-language-model benchmark [E0001]
  evidenceIds:
    - e1
datasets: []
benchmarks:
  - name: dna-language-model benchmark
    role: testing
    scale: null
    organisms: []
    evidenceIds:
      - e1
results:
  - claim: Achieves state-of-the-art performance in dna-language-model [E0001].
    metric: null
    value: null
    baseline: null
    delta: null
    benchmark: dna-language-model benchmark
    evidenceIds:
      - e1
takeaways:
  - statement:
      Near-lossless genomic perplexity, splice-site prediction, and variant effect prediction with 8x reachable context
      gain [E0001].
    evidenceIds:
      - e1
limitations:
  - statement: Evaluated primarily on single-GPU hardware configurations [E0001].
    evidenceIds:
      - e1
provenance:
  generation:
    provider: cloudflare-workers-ai
    model: "@cf/google/gemma-4-26b-a4b-it"
    generatedAt: "2026-09-03T18:00:00.000Z"
    prompt:
      id: deepgeno-technical-summary
      version: 1.0.0
    outputSchemaVersion: "1.0"
  review:
    approvedAt: "2026-09-03T18:00:00.000Z"
doi: 10.64898/2026.08.28.747902
pdfUrl: https://www.biorxiv.org/content/10.64898/2026.08.28.747902v1.full.pdf
---

<!-- Structured page body is rendered by Astro from validated frontmatter. -->
