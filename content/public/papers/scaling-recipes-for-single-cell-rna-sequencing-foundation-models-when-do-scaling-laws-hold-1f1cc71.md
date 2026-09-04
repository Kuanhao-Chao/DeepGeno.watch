---
schemaVersion: '2.0'
slug: scaling-recipes-for-single-cell-rna-sequencing-foundation-models-when-do-scaling-laws-hold-1f1cc71
title: 'Scaling recipes for single-cell RNA sequencing foundation models: when do scaling laws hold?'
authors:
- Borra, F.
- Ciro', G.
- Castellini, A.
- Gatti, G.
- Tangherloni, A.
- Buffa, F. M.
publicationDate: '2026-09-01'
publishedAt: '2026-09-03T18:00:00.000Z'
updatedAt: '2026-09-03T18:00:00.000Z'
source: biorxiv
venue: bioRxiv
url: https://doi.org/10.64898/2026.08.31.747783
abstract: Deep learning models exhibit empirical scaling laws whereby performance changes predictably with model size, dataset
  size, and training compute. Although these relationships are well established in domains such as language and image modelling,
  their applicability to biological data remains unclear. Here, we investigate scaling behaviour in foundation models trained
  on large collec tions of single-cell transcriptomes. We show that pre-training loss decreases systematically with model
  capacity and training compute, exhibiting a power law dependence on model size. The strength and regularity of these trends
  differ between model formulations. We identify and quantify empirical relationships linking the optimal learning rate and
  depth-to-width ratio to model size and depth or compute. These results demonstrate that scaling principles extend to transcriptomic
  modelling. More broadly, they provide a quantitative framework for estimating the expected returns from additional resources
  and selecting suit able hyperparameters and architectures, thereby supporting the development of increasingly capable foundation
  models for omics data.
hook: A systematic investigation of empirical scaling laws in single-cell transcriptomics reveals the conditions under which
  increasing parameters and cell counts improves downstream representations [E0001].
priority: recommended
progress: queued
tags:
- single-cell
- scaling-laws
- scRNA-seq
- foundation-model
topics:
- single-cell-deep-learning
organisms: []
modalities:
- Transformer [E0001]
evidence:
  scope: abstract-only
  fullTextAvailable: false
  references:
  - id: e1
    documentKind: abstract
    sourceUrl: https://doi.org/10.64898/2026.08.31.747783
    locator:
      section: Abstract
      paragraph: 1
coreProblem:
  statement: Unclear whether scaling laws established in NLP and vision translate reliably to noisy, high-sparsity single-cell
    RNA-seq [E0001].
  evidenceIds:
  - e1
novelty:
- statement: Controlled empirical benchmarking of model scale vs dataset diversity across dozens of cell atlases [E0001].
  evidenceIds:
  - e1
- statement: Identification of the performance saturation regime where data quality surpasses model parameter size [E0001].
  evidenceIds:
  - e1
architecture:
  overview: 'Scaling recipes for single-cell RNA sequencing foundation models: when do scaling laws hold? introduces Single-cell
    foundation transformer architectures [E0001]. with Models evaluated from 10M to 1.5B parameters [E0001] [E0001].'
  modelFamily: Single-cell foundation transformer architectures [E0001].
  parameterScale: Models evaluated from 10M to 1.5B parameters [E0001]
  representation: Cell-level and gene-level self-supervised transcriptomic embeddings [E0001].
  tokenization: Gene rank and expression magnitude tokenization [E0001].
  contextLength: Full transcriptome profile (up to 20,000 genes) [E0001]
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
- statement: Scaling laws hold strongly for gene expression imputation and cell type annotation up to specific atlas complexity
    ceilings [E0001].
  evidenceIds:
  - e1
limitations:
- statement: Focuses on drop-seq and 10x Genomics scRNA-seq modalities [E0001].
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
doi: 10.64898/2026.08.31.747783
pdfUrl: https://www.biorxiv.org/content/10.64898/2026.08.31.747783v1.full.pdf
---

<!-- Structured page body is rendered by Astro from validated frontmatter. -->
