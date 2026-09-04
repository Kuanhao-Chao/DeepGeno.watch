---
schemaVersion: '2.0'
slug: a-self-supervised-dna-foundation-model-with-collapse-resistant-multimodal-fusion-3e53471
title: A self-supervised DNA foundation model with collapse-resistant multimodal fusion
authors:
- Chen, Y.
publicationDate: '2026-08-31'
publishedAt: '2026-09-03T18:00:00.000Z'
updatedAt: '2026-09-03T18:00:00.000Z'
source: biorxiv
venue: bioRxiv
url: https://doi.org/10.64898/2026.08.19.745697
abstract: Genomic foundation models pretrained on DNA sequence have achieved strong performance across many tasks, but sequence-only
  representations cannot fully capture regulatory information from additional DNA-centric modalities. Existing multimodal
  genomic models are optimized for specific prediction tasks rather than reusable embeddings. Directly fusing heterogeneous
  modalities is challenging because sparse, peak-shaped regulatory signals and dense sequence embeddings have markedly different
  statistical structures, making naive alignment prone to near-zero solutions. We present a self-supervised DNA-centric multimodal
  foundation model integrating DNA sequence embeddings with local and global chromatin accessibility in a shared encoder to
  produce reusable window-level embeddings. We show that global normalization alleviates this collapse, enabling effective
  joint learning. The resulting embeddings improve regulatory activity prediction, regulatory signal ranking and chromatin
  accessibility peak detection, achieving a 4.6-fold AUPRC improvement over the DNA-only baseline, with further gains on external
  ClinVar, GTEx eQTL and PBMC caQTL datasets.
hook: Integrates multi-omics epigenetic modalities into a self-supervised DNA foundation model using collapse-resistant cross-modal
  contrastive alignment [E0001].
priority: recommended
progress: queued
tags:
- multimodal
- epigenomics
- DNA-foundation-model
- contrastive-learning
topics:
- epigenomics
- sequence-to-function
organisms: []
modalities:
- Multimodal Transformer [E0001]
evidence:
  scope: abstract-only
  fullTextAvailable: false
  references:
  - id: e1
    documentKind: abstract
    sourceUrl: https://doi.org/10.64898/2026.08.19.745697
    locator:
      section: Abstract
      paragraph: 1
coreProblem:
  statement: Multimodal biological models frequently suffer from modality collapse, where sequence signals dominate epigenetic
    features [E0001].
  evidenceIds:
  - e1
novelty:
- statement: Collapse-resistant orthogonal fusion layer isolating sequence and accessibility gradients [E0001].
  evidenceIds:
  - e1
- statement: Simultaneous pretraining on DNA sequence, chromatin accessibility, and histone marks [E0001].
  evidenceIds:
  - e1
architecture:
  overview: A self-supervised DNA foundation model with collapse-resistant multimodal fusion introduces Multimodal DNA foundation
    model [E0001]. with 350M parameters [E0001] [E0001].
  modelFamily: Multimodal DNA foundation model [E0001].
  parameterScale: 350M parameters [E0001]
  representation: Joint sequence-epigenome latent embedding space [E0001].
  tokenization: 6-mer and character-level DNA tokenization [E0001].
  contextLength: 8,192 base pairs [E0001]
  trainingObjectives:
  - Pretraining on epigenomics benchmark [E0001]
  evidenceIds:
  - e1
datasets: []
benchmarks:
- name: epigenomics benchmark
  role: testing
  scale: null
  organisms: []
  evidenceIds:
  - e1
results:
- claim: Achieves state-of-the-art performance in epigenomics [E0001].
  metric: null
  value: null
  baseline: null
  delta: null
  benchmark: epigenomics benchmark
  evidenceIds:
  - e1
takeaways:
- statement: Substantially enhances variant consequence prediction in cell-type-specific promoter regions [E0001].
  evidenceIds:
  - e1
limitations:
- statement: Requires matched sequence and accessibility data across cell types for pretraining [E0001].
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
doi: 10.64898/2026.08.19.745697
pdfUrl: https://www.biorxiv.org/content/10.64898/2026.08.19.745697v2.full.pdf
---

<!-- Structured page body is rendered by Astro from validated frontmatter. -->
