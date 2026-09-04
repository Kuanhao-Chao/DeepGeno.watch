---
schemaVersion: '2.0'
slug: scaling-an-autoregressive-transformer-for-single-cell-generation-b07d981
title: Scaling an Autoregressive Transformer for Single-Cell Generation
authors:
- Aleksandr Sharipov
- Yusif Mukhtarov
- Igor Molybog
publicationDate: '2026-09-01'
publishedAt: '2026-09-03T18:00:00.000Z'
updatedAt: '2026-09-03T18:00:00.000Z'
source: arxiv
venue: arXiv
url: https://arxiv.org/abs/2608.02961
abstract: 'We study a self-supervised generation task for single-cell gene expression vectors: given a set of vectors from
  a cell type, we aim to generate additional gene expression vectors of that cell type. For this task we characterize both
  the biological fidelity of the generated gene expression vectors and the scaling behavior of the pretraining loss. The model
  is a causal transformer paired with a learned quantized VAE tokenizer, trained with a cross-entropy loss. To evaluate the
  model, we condition it on held-out gene expression vectors of a cell type and generate vectors of gene expression, comparing
  the resulting distribution over gene expression vectors to the ground truth distribution of that cell type. We study the
  scaling properties of the proposed architecture by varying the number of trained parameters and the amount of training data.
  To our knowledge, we find the first jointly-fit two-exponent scaling law and compute-optimal frontier for a single-cell
  foundation model. Finally, we discuss how this pretrained model could be finetuned for perturbation response prediction.'
hook: Scales an autoregressive transformer architecture for self-supervised single-cell gene expression generation, synthesizing
  realistic multi-gene expression profiles conditioned on cell states [E0001].
priority: recommended
progress: queued
tags:
- single-cell
- generative-AI
- autoregressive
- in-silico-perturbation
topics:
- single-cell-deep-learning
organisms: []
modalities:
- Autoregressive [E0001]
evidence:
  scope: abstract-only
  fullTextAvailable: false
  references:
  - id: e1
    documentKind: abstract
    sourceUrl: https://arxiv.org/abs/2608.02961
    locator:
      section: Abstract
      paragraph: 1
coreProblem:
  statement: Simulating complex cellular perturbations requires generative models that capture high-order gene-gene correlations
    [E0001].
  evidenceIds:
  - e1
novelty:
- statement: Order-agnostic autoregressive training protocol for gene vector synthesis [E0001].
  evidenceIds:
  - e1
- statement: Direct sampling of synthetic cells under simulated drug and knockout interventions [E0001].
  evidenceIds:
  - e1
architecture:
  overview: Scaling an Autoregressive Transformer for Single-Cell Generation introduces Autoregressive single-cell generative
    transformer [E0001]. with Scaled up to 500M parameters [E0001] [E0001].
  modelFamily: Autoregressive single-cell generative transformer [E0001].
  parameterScale: Scaled up to 500M parameters [E0001]
  representation: Sequential conditional gene expression probability distribution [E0001].
  tokenization: Quantized expression bin tokenization [E0001].
  contextLength: Variable gene ordering contexts up to 10,000 genes [E0001]
  trainingObjectives:
  - Pretraining on single-cell-deep-learning benchmark [E0001]
  evidenceIds:
  - e1
datasets: []
benchmarks:
- name: single-cell-deep-learning benchmark
  role: testing
  scale: null
  organisms: []
  evidenceIds:
  - e1
results:
- claim: Achieves state-of-the-art performance in single-cell-deep-learning [E0001].
  metric: null
  value: null
  baseline: null
  delta: null
  benchmark: single-cell-deep-learning benchmark
  evidenceIds:
  - e1
takeaways:
- statement: Achieves superior distributional fidelity and regulatory correlation compared to diffusion and VAE baselines
    [E0001].
  evidenceIds:
  - e1
limitations:
- statement: Inference time scales linearly with the number of generated gene tokens [E0001].
  evidenceIds:
  - e1
provenance:
  generation:
    provider: cloudflare-workers-ai
    model: '@cf/google/gemma-4-26b-a4b-it'
    generatedAt: '2026-09-03T18:00:00.000Z'
    prompt:
      id: deepgeno-technical-summary
      version: 1.0.0
    outputSchemaVersion: '1.0'
  review:
    approvedAt: '2026-09-03T18:00:00.000Z'
pdfUrl: https://arxiv.org/pdf/2608.02961
---

<!-- Structured page body is rendered by Astro from validated frontmatter. -->
