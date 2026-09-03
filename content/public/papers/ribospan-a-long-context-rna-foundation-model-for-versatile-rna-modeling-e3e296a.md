---
schemaVersion: "2.0"
slug: ribospan-a-long-context-rna-foundation-model-for-versatile-rna-modeling-e3e296a
title: "RIBOSPAN: A Long-Context RNA Foundation Model for Versatile RNA Modeling"
authors:
  - Ziyuan Wang
  - Bohao Tang
  - Fei Zhang
  - Shuo Han
  - Pengfei Liu
publicationDate: 2026-08-28
publishedAt: 2026-09-03T18:14:46.602Z
updatedAt: 2026-09-03T18:14:46.602Z
source: arxiv
url: https://arxiv.org/abs/2608.22849
pdfUrl: https://arxiv.org/pdf/2608.22849
hook: RIBOSPAN overcomes the context limitations of existing RNA foundation models by providing a 1.61B-parameter bidirectional architecture natively pretrained for long-context modeling up to 10,240 nt [E0001].
priority: must-read
progress: read
tags:
  - RNA foundation model
  - long-context
  - mRNA design
  - diffusion
topics:
  - sequence-to-function
  - sequence-to-function
  - sequence-to-function
organisms: []
modalities:
  - Encoder-only [E0001]
  - Discrete-diffusion [E0001]
evidence:
  scope: abstract-only
  fullTextAvailable: false
  references:
    - id: e1
      documentKind: abstract
      sourceUrl: https://arxiv.org/abs/2608.22849
      locator:
        section: Abstract
        paragraph: 1
coreProblem:
  statement: Existing RNA foundation models often use context lengths that are insufficient for modeling full-length RNAs, such as messenger RNAs, at single-nucleotide resolution [E0001].
  evidenceIds:
    - e1
novelty:
  - statement: RIBOSPAN combines dense bidirectional self-attention, single-nucleotide tokenization, and attention-isolated sequence packing to enable high-resolution modeling of complete long RNAs [E0001].
    evidenceIds:
      - e1
architecture:
  overview: RIBOSPAN is a 1.61-billion-parameter bidirectional RNA foundation model [E0001] that employs dense bidirectional self-attention, single-nucleotide tokenization, and attention-isolated sequence packing to facilitate high-resolution modeling of complete long RNAs [E0001].
  modelFamily: Bidirectional RNA foundation model [E0001].
  parameterScale: 1.61 billion [E0001]
  representation: RIBOSPAN learns state-of-the-art RNA representations, showing a distinct advantage on long RNAs [E0001]. In long-context benchmarks, it maintains strong contextual responsiveness and context-specific representation separation while keeping perturbation-induced changes highly localized [E0001].
  tokenization: Single-nucleotide tokenization [E0001].
  contextLength: Natively pretrained with context lengths up to 10,240 nt [E0001].
  trainingObjectives:
    - Reconstruction at 10,240 tokens [E0001]
  evidenceIds:
    - e1
datasets: []
benchmarks:
  - name: Long-context benchmark
    role: testing
    scale: null
    organisms: []
    evidenceIds:
      - e1
  - name: Downstream biological benchmarks
    role: testing
    scale: null
    organisms: []
    evidenceIds:
      - e1
results:
  - claim: Achieves state-of-the-art performance [E0001].
    metric: null
    value: null
    baseline: null
    delta: null
    benchmark: Full-transcript biological property prediction
    evidenceIds:
      - e1
  - claim: Achieves state-of-the-art performance [E0001].
    metric: null
    value: null
    baseline: null
    delta: null
    benchmark: Zero-shot mutation-fitness modeling
    evidenceIds:
      - e1
takeaways:
  - statement: RIBOSPAN establishes a foundation for transferable RNA representation learning, biological prediction, and full-transcript mRNA design [E0001].
    evidenceIds:
      - e1
limitations:
  - statement: Inference-time YaRN scaling induces substantially greater distal representation diffusion [E0001].
    evidenceIds:
      - e1
provenance:
  generation:
    provider: cloudflare-workers-ai
    model: "@cf/google/gemma-4-26b-a4b-it"
    generatedAt: 2026-09-03T08:53:48.103Z
    prompt:
      id: deepgeno-technical-summary
      version: 1.0.0
    outputSchemaVersion: "1.0"
  review:
    approvedAt: 2026-09-03T18:13:33.000Z
---

<!-- Structured page body is rendered by Astro from validated frontmatter. -->
