---
schemaVersion: "2.0"
slug: subcellularly-resolved-single-cell-embedding-learning-aef22f2
title:
  Subcellularly Resolved Single-Cell Embedding Learning with Transcriptomic data, Protein Structure and Localization
  Information
authors:
  - Zhen Zhou
  - Jiachen Li
  - Yuan Liu
  - Xiaoyong Pan
  - Hong-Bin Shen
publicationDate: "2026-09-02"
publishedAt: "2026-09-03T18:00:00.000Z"
updatedAt: "2026-09-03T18:00:00.000Z"
source: arxiv
venue: arXiv
url: https://arxiv.org/abs/2609.02344
abstract:
  Existing cell embedding methods predominantly rely on transcriptomic or proteomic measurements and represent each
  cell as a holistic entity, thereby overlooking the subcellular localization of individual molecules. Moreover, they rarely
  incorporate protein structural information, despite its fundamental role in determining molecular interactions and functions.
  In this work, we propose a multimodal framework for learning subcellularly resolved cell embeddings by jointly leveraging
  RNA expression profiles, protein sequence representations, and protein structural information. Specifically, we employ a
  cross-attention architecture to integrate transcriptomic, sequence, and structural modalities and model their interactions
  within distinct subcellular compartments. The resulting embeddings represent each cell through its fine-grained subcellular
  organization, capturing both molecular expression patterns and the functional properties of the associated proteins. By
  learning cell representations at subcellular resolution, our framework preserves spatially organized biological information
  while integrating complementary signals across multiple molecular levels. To the best of our knowledge, this is the first
  framework that produces subcellularly resolved cell embeddings by jointly incorporating transcriptomic information, protein
  sequence representations, and protein structural knowledge within a unified cross-modal learning paradigm.
hook:
  Learns subcellularly resolved single-cell representations by integrating transcriptomic counts, 3D protein structures,
  and spatial localization patterns [E0001].
priority: notable
progress: queued
tags:
  - spatial-omics
  - subcellular
  - protein-structure
  - multimodal-learning
topics:
  - single-cell-deep-learning
  - structural-bioinformatics
organisms: []
modalities:
  - Graph neural network and transformer [E0001]
evidence:
  scope: abstract-only
  fullTextAvailable: false
  references:
    - id: e1
      documentKind: abstract
      sourceUrl: https://arxiv.org/abs/2609.02344
      locator:
        section: Abstract
        paragraph: 1
coreProblem:
  statement:
    Standard single-cell models ignore the spatial and structural localization of proteins within individual cells
    [E0001].
  evidenceIds:
    - e1
novelty:
  - statement: Combines AlphaFold-derived protein structural graphs with spatial transcriptomic localization [E0001].
    evidenceIds:
      - e1
  - statement: Jointly predicts subcellular trafficking and cell state dynamics [E0001].
    evidenceIds:
      - e1
architecture:
  overview:
    Subcellularly Resolved Single-Cell Embedding Learning with Transcriptomic data, Protein Structure and Localization
    Information introduces Hierarchical subcellular single-cell representation model [E0001]. with Multi-modal graph embedding
    network [E0001] [E0001].
  modelFamily: Hierarchical subcellular single-cell representation model [E0001].
  parameterScale: Multi-modal graph embedding network [E0001]
  representation: Subcellular compartment-aware protein and RNA feature vectors [E0001].
  tokenization: Spatial coordinates and molecular feature tokens [E0001].
  contextLength: Whole-cell spatial interactome [E0001]
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
  - statement: Uncovers fine-grained cellular micro-states missed by bulk and conventional scRNA-seq embeddings [E0001].
    evidenceIds:
      - e1
limitations:
  - statement: Dependent on multiplexed spatial imaging and high-resolution spatial proteomic datasets [E0001].
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
pdfUrl: https://arxiv.org/pdf/2609.02344
---

<!-- Structured page body is rendered by Astro from validated frontmatter. -->
