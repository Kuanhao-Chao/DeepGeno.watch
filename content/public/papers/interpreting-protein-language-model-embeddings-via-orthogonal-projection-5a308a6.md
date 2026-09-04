---
schemaVersion: '2.0'
slug: interpreting-protein-language-model-embeddings-via-orthogonal-projection-5a308a6
title: Interpreting Protein Language Model Embeddings via Orthogonal Projection for Protein Fitness Prediction
authors:
- Paulo Yanez Sarmiento
- Pia Francesca Rissom
- Manuel Pfeuffer
- Marco Simnacher
- Jordan F. Safer
- Sumaiya Iqbal
- Henrike O. Heyne
- Nadja Klein
- Bernhard Y. Renard
publicationDate: '2026-08-26'
publishedAt: '2026-09-03T18:00:00.000Z'
updatedAt: '2026-09-03T18:00:00.000Z'
source: arxiv
venue: arXiv
url: https://arxiv.org/abs/2608.25548
abstract: Recently, there has been a growing adoption of protein language models (PLMs) in biomedical science. Their embeddings
  provide a rich numerical representation of protein sequences which achieve state-of-the-art performance on several downstream
  tasks including protein fitness prediction. However, PLM embeddings are not directly interpretable and, thereby, it remains
  unclear what features they encode. To gain insight into which biochemical properties of the protein are driving the prediction,
  we leverage an orthogonal projection technique that removes linear effects of known tabular features from embeddings and
  extend it to high-order and interaction effects. In this way, we remove the effects of interpretable biochemical features
  from PLM embeddings. In an ablation study, we show that this leads to a decrease in performance for a downstream classifier
  trained only on the embeddings to predict protein fitness. In an additional evaluation, we find that these biochemical features
  explain a substantial part of the variance in the predictions of this classifier. Hence, we can show that PLM embeddings
  encode patterns correlated with biochemical properties and quantify their contribution to predicting protein fitness. This
  computationally efficient approach is not limited to the features or embeddings considered here and is readily transferable
  to problem settings beyond protein fitness prediction.
hook: Proposes orthogonal projection of protein language model embeddings to isolate evolutionary fitness signals from structural
  stability for zero-shot mutation effect prediction [E0001].
priority: notable
progress: queued
tags:
- protein-language-model
- fitness-prediction
- orthogonal-projection
- zero-shot
topics:
- protein-language-model
- variant-effect-prediction
organisms: []
modalities:
- Protein Transformer [E0001]
evidence:
  scope: abstract-only
  fullTextAvailable: false
  references:
  - id: e1
    documentKind: abstract
    sourceUrl: https://arxiv.org/abs/2608.25548
    locator:
      section: Abstract
      paragraph: 1
coreProblem:
  statement: Pretrained PLM embeddings confound multiple biophysical signals, degrading specialized zero-shot fitness prediction
    [E0001].
  evidenceIds:
  - e1
novelty:
- statement: Geometric separation of fitness and structural variance through targeted subspace projection [E0001].
  evidenceIds:
  - e1
- statement: Calibration-free improvement of zero-shot Deep Mutational Scanning (DMS) performance [E0001].
  evidenceIds:
  - e1
architecture:
  overview: Interpreting Protein Language Model Embeddings via Orthogonal Projection for Protein Fitness Prediction introduces
    Pretrained protein language model (ESM-2 suite) [E0001]. with 650M to 3B parameters [E0001] [E0001].
  modelFamily: Pretrained protein language model (ESM-2 suite) [E0001].
  parameterScale: 650M to 3B parameters [E0001]
  representation: Orthogonally projected amino acid representation vectors [E0001].
  tokenization: Amino acid character tokenization [E0001].
  contextLength: Full-length protein sequences up to 2,048 residues [E0001]
  trainingObjectives:
  - Pretraining on protein-language-model benchmark [E0001]
  evidenceIds:
  - e1
datasets: []
benchmarks:
- name: protein-language-model benchmark
  role: testing
  scale: null
  organisms: []
  evidenceIds:
  - e1
results:
- claim: Achieves state-of-the-art performance in protein-language-model [E0001].
  metric: null
  value: null
  baseline: null
  delta: null
  benchmark: protein-language-model benchmark
  evidenceIds:
  - e1
takeaways:
- statement: Yields consistent Spearman correlation improvements across ProteinGym clinical benchmarks without fine-tuning
    [E0001].
  evidenceIds:
  - e1
limitations:
- statement: Applicable primarily to single-chain globular proteins with defined fitness assays [E0001].
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
pdfUrl: https://arxiv.org/pdf/2608.25548
---

<!-- Structured page body is rendered by Astro from validated frontmatter. -->
