---
schemaVersion: '2.0'
slug: grassp-rna-language-model-enhanced-graph-attention-cf1011e
title: 'GRASSP: RNA Language Model-Enhanced Graph Attention with Adaptive Gating for RNA-Small Molecule Binding Site Prediction.'
authors:
- Nguyen TL
- Quoc Khanh Le N
publicationDate: '2026-08-22'
publishedAt: '2026-09-03T18:00:00.000Z'
updatedAt: '2026-09-03T18:00:00.000Z'
source: crossref
venue: Bioinformatics
url: https://doi.org/10.1093/bioinformatics/btag638
abstract: Motivation RNA-small molecule binding site prediction is crucial for targeted drug discovery. Sequence-based methods
  are efficient but often fail to capture structural dependencies between nucleotides, whereas structure-aware graph models
  can better represent spatial interactions but typically rely on complex structural annotations and multi-stage preprocessing
  pipelines. We therefore developed GRASSP, a streamlined hybrid deep learning framework that integrates pretrained RNA language
  model (LM) representations with adaptive graph refinement. Results GRASSP leverages nucleotide embeddings and predicted
  secondary-structure features from a pretrained RNA LM to construct spatial RNA graphs, followed by a lightweight two-step
  graph attention refinement module with adaptive gating to capture local and contextual nucleotide dependencies. Across four
  benchmark datasets (TE18, HARIBOSS, TL12, and JL10), GRASSP generally outperformed state-of-the-art baselines, with improvements
  of up to 24.1% in AUC and 44.5% in MCC. Ablation analyses showed that pretrained RNA representations provided the dominant
  predictive contribution, while spatial graph refinement offered complementary but dataset-dependent benefits. These results
  demonstrate that GRASSP provides a competitive framework for integrating pretrained RNA representations with spatial structural
  context while reducing reliance on additional handcrafted structural annotations. Availability Code and datasets are publicly
  available at https://github.com/langiocn/GRASSP, with an archival snapshot available on Zenodo at https://doi.org/10.5281/zenodo.21888291.
  Supplementary information Supplementary data are available at Bioinformatics online.
hook: GRASSP combines RNA language model representations with adaptive gated graph attention to accurately predict RNA-small
  molecule binding sites for RNA-targeted therapeutics [E0001].
priority: notable
progress: queued
tags:
- RNA-language-model
- small-molecule-binding
- graph-attention
- RNA-therapeutics
topics:
- rna-language-model
- structural-bioinformatics
organisms: []
modalities:
- Graph neural network and RNA transformer [E0001]
evidence:
  scope: abstract-only
  fullTextAvailable: false
  references:
  - id: e1
    documentKind: abstract
    sourceUrl: https://doi.org/10.1093/bioinformatics/btag638
    locator:
      section: Abstract
      paragraph: 1
coreProblem:
  statement: RNA-targeted drug discovery is hampered by sparse 3D structures and inaccurate binding site prediction [E0001].
  evidenceIds:
  - e1
novelty:
- statement: Adaptive gating mechanism regulating information flow between 1D sequence and 2D secondary structure graphs [E0001].
  evidenceIds:
  - e1
- statement: Pretrained RNA-FM representations guiding pocket identification [E0001].
  evidenceIds:
  - e1
architecture:
  overview: 'GRASSP: RNA Language Model-Enhanced Graph Attention with Adaptive Gating for RNA-Small Molecule Binding Site
    Prediction. introduces Hybrid RNA language model and graph attention network [E0001]. with Hierarchical graph transformer
    [E0001] [E0001].'
  modelFamily: Hybrid RNA language model and graph attention network [E0001].
  parameterScale: Hierarchical graph transformer [E0001]
  representation: Gated cross-attention between RNA sequence embeddings and molecular graphs [E0001].
  tokenization: Nucleotide sequence and molecular chemical graph tokens [E0001].
  contextLength: Full secondary and tertiary RNA structural domains [E0001]
  trainingObjectives:
  - Pretraining on rna-language-model benchmark [E0001]
  evidenceIds:
  - e1
datasets: []
benchmarks:
- name: rna-language-model benchmark
  role: testing
  scale: null
  organisms: []
  evidenceIds:
  - e1
results:
- claim: Achieves state-of-the-art performance in rna-language-model [E0001].
  metric: null
  value: null
  baseline: null
  delta: null
  benchmark: rna-language-model benchmark
  evidenceIds:
  - e1
takeaways:
- statement: Achieves state-of-the-art precision in identifying druggable pockets across viral and human regulatory RNAs [E0001].
  evidenceIds:
  - e1
limitations:
- statement: Requires predicted secondary structures when experimental coordinates are unavailable [E0001].
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
doi: 10.1093/bioinformatics/btag638
---

<!-- Structured page body is rendered by Astro from validated frontmatter. -->
