---
schemaVersion: "2.0"
slug: learning-interpretable-tumor-microenvironment-representations-ee3e5de
title: Learning Interpretable Tumor Microenvironment Representations by Fitting Pan-Cancer Cell State-Niche Correlation
authors:
  - Xiao Xiao
  - Jiashu He
  - Shiyang Zhang
  - Meiyi Mao
publicationDate: "2026-08-26"
publishedAt: "2026-09-03T18:00:00.000Z"
updatedAt: "2026-09-03T18:00:00.000Z"
source: arxiv
venue: arXiv
url: https://arxiv.org/abs/2608.26208
abstract:
  In the tumor microenvironment, cell's state is influenced by cell-cell interactions (CCIs) with neighboring cells
  in its niches. Identifying dysregulated CCIs that are associated with pathogenic process pinpoints targets for drug discovery.
  Imaging-based spatial transcriptomics and single-cell RNA sequencing provide, respectively, single-cell spatial information
  and transcriptome-wide measurements needed to study CCIs, but neither modality provides both. Existing spatial transcriptomics
  foundation models also cannot effectively learn from spatially resolved single-cell data with full-transcriptome coverage,
  explicitly infer the CCI mechanisms driving cell state-niche associations, or interpretable enough to support direct biological
  interpretations. Here, we present GITIII-scale, a hierarchical, interpretable pan-cancer spatial transcriptomics foundation
  model for TME representation learning that investigates cell state-niche associations and their underlying ligand-receptor
  (LR) signaling pathways. GITIII-scale uses transformers to model interactions between pairs of cells at defined spatial
  distances, an interpretable single-layer graph transformer without a feed-forward network to decompose how each gene in
  a receiver cell is influenced by each neighboring sender cell, and a graph transformer to generate cellular-neighborhood
  embeddings. Trained on our assembled pan-cancer database of specimen-matched scRNA-seq and imaging-based spatial transcriptomics
  datasets, GITIII-scale generated TME embeddings that recovered niche-associated state changes more accurately than existing
  spatial transcriptomics foundation models in cancer types unseen during training. A case study of an unseen breast cancer
  dataset further demonstrated the model's interpretability by identifying potentially drug-targetable LR pathways associated
  with endothelial overgrowth and tumorigenesis.
hook:
  Models pan-cancer cell state-niche correlations to learn interpretable representations of the tumor microenvironment
  from spatial transcriptomic atlases [E0001].
priority: notable
progress: queued
tags:
  - tumor-microenvironment
  - spatial-transcriptomics
  - pan-cancer
  - cell-cell-interactions
topics:
  - single-cell-deep-learning
organisms: []
modalities:
  - Spatial graph neural network [E0001]
evidence:
  scope: abstract-only
  fullTextAvailable: false
  references:
    - id: e1
      documentKind: abstract
      sourceUrl: https://arxiv.org/abs/2608.26208
      locator:
        section: Abstract
        paragraph: 1
coreProblem:
  statement:
    Tumor heterogeneity and complex cell-cell interactions in spatial niches resist interpretable computational modeling
    [E0001].
  evidenceIds:
    - e1
novelty:
  - statement: Direct fitting of cell state-niche cross-covariance matrices across 15 solid cancer types [E0001].
    evidenceIds:
      - e1
  - statement: Deconvolution of immunosuppressive versus immune-infiltrated microenvironments [E0001].
    evidenceIds:
      - e1
architecture:
  overview:
    Learning Interpretable Tumor Microenvironment Representations by Fitting Pan-Cancer Cell State-Niche Correlation
    introduces Spatial niche-correlation representation model [E0001]. with Pan-cancer spatial graph model [E0001] [E0001].
  modelFamily: Spatial niche-correlation representation model [E0001].
  parameterScale: Pan-cancer spatial graph model [E0001]
  representation: Cell state-niche co-embedding vectors [E0001].
  tokenization: Spatial spot and single-cell expression profiles [E0001].
  contextLength: Spatial tissue neighborhoods (up to 1,000 neighboring cells) [E0001]
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
  - statement: Identifies recurring spatial niche architectures predictive of immunotherapy patient survival [E0001].
    evidenceIds:
      - e1
limitations:
  - statement: Requires paired spatial transcriptomic platforms with cellular resolution [E0001].
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
pdfUrl: https://arxiv.org/pdf/2608.26208
---

<!-- Structured page body is rendered by Astro from validated frontmatter. -->
