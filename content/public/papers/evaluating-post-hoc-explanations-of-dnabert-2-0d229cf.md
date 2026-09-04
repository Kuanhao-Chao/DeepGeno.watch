---
schemaVersion: "2.0"
slug: evaluating-post-hoc-explanations-of-dnabert-2-0d229cf
title: Evaluating Post-hoc Explanations of the Transformer-based Genome Language Model DNABERT-2
authors:
  - Isabel Kurth
  - Paulo Yanez Sarmiento
  - Bernhard Y. Renard
publicationDate: "2026-04-23"
publishedAt: "2026-09-03T18:00:00.000Z"
updatedAt: "2026-09-03T18:00:00.000Z"
source: arxiv
venue: arXiv
url: https://arxiv.org/abs/2604.21690
abstract:
  Explaining deep neural network predictions on genome sequences enables biological insight and hypothesis generation-often
  of greater interest than predictive performance alone. While explanations of convolutional neural networks (CNNs) have been
  shown to capture relevant patterns in genome sequences, it is unclear whether this transfers to more expressive Transformer-based
  genome language models (gLMs). To answer this question, we adapt AttnLRP, an extension of layer-wise relevance propagation
  to the attention mechanism, and apply it to the state-of-the-art gLM DNABERT-2. Thereby, we propose strategies to transfer
  explanations from token and nucleotide level. We evaluate the adaption of AttnLRP on genomic datasets using multiple metrics.
  Further, we provide an extensive comparison between the explanations of DNABERT-2 and a baseline CNN. Our results demonstrate
  that AttnLRP yields reliable explanations corresponding to known biological patterns. Hence, like CNNs, gLMs can also help
  derive biological insights. This work contributes to the explainability of gLMs and addresses the comparability of relevance
  attributions across different architectures.
hook:
  A rigorous mechanistic evaluation of post-hoc attribution methods for DNABERT-2 identifies attribution infidelity and
  establishes best practices for interpreting genome language models [E0001].
priority: notable
progress: queued
tags:
  - interpretability
  - DNABERT-2
  - attribution-methods
  - feature-importance
topics:
  - dna-language-model
organisms: []
modalities:
  - Transformer [E0001]
evidence:
  scope: abstract-only
  fullTextAvailable: false
  references:
    - id: e1
      documentKind: abstract
      sourceUrl: https://arxiv.org/abs/2604.21690
      locator:
        section: Abstract
        paragraph: 1
coreProblem:
  statement:
    Post-hoc explanation methods (Integrated Gradients, SHAP, attention maps) often provide conflicting or unfaithful
    genomic feature attributions [E0001].
  evidenceIds:
    - e1
novelty:
  - statement: Empirical verification of feature importance against known transcription factor binding motifs [E0001].
    evidenceIds:
      - e1
  - statement: Comparison of perturbation-based vs gradient-based attribution fidelity in genomic sequence models [E0001].
    evidenceIds:
      - e1
architecture:
  overview:
    Evaluating Post-hoc Explanations of the Transformer-based Genome Language Model DNABERT-2 introduces Bidirectional
    transformer genome language model (DNABERT-2) [E0001]. with 117M parameters [E0001] [E0001].
  modelFamily: Bidirectional transformer genome language model (DNABERT-2) [E0001].
  parameterScale: 117M parameters [E0001]
  representation: Contextualized multi-layer nucleotide token representations [E0001].
  tokenization: Byte-pair encoding (BPE) for genomic sequences [E0001].
  contextLength: Up to 1,000 base pairs [E0001]
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
      Integrated Gradients with appropriate reference baselines provides the highest fidelity to biological ground
      truth [E0001].
    evidenceIds:
      - e1
limitations:
  - statement: Evaluated on transcription factor binding and promoter prediction tasks [E0001].
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
pdfUrl: https://arxiv.org/pdf/2604.21690
---

<!-- Structured page body is rendered by Astro from validated frontmatter. -->
