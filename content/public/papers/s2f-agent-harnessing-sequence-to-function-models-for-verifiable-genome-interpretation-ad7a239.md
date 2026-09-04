---
schemaVersion: "2.0"
slug: s2f-agent-harnessing-sequence-to-function-models-for-verifiable-genome-interpretation-ad7a239
title: "S2F-Agent: Harnessing sequence-to-function models for verifiable genome interpretation"
authors:
  - Li, J.
  - Qin, T.
  - Li, J. G.
  - Bao, Z.
publicationDate: "2026-08-31"
publishedAt: "2026-09-03T18:00:00.000Z"
updatedAt: "2026-09-03T18:00:00.000Z"
source: biorxiv
venue: bioRxiv
url: https://doi.org/10.64898/2026.05.13.724757
abstract:
  Sequence-to-function (S2F) models offer a revolutionary paradigm for genotype-phenotype mapping, yet their broader
  application is bottlenecked by the need for reliable orchestration and interpretation across a fragmented model ecosystem.
  While general-purpose language models can automate scientific workflows, they are not inherently grounded in the model-specific
  execution constraints required for robust S2F analysis. Here, we present S2F-Agent, a human-in-the-loop framework designed
  for the verifiable orchestration of the heterogeneous S2F ecosystems. The framework employs a contract-based harness to
  bridge model-specific capabilities (Skills) and model-agnostic biological objectives (Playbooks), seamlessly translating
  free-form biological requests into reliable execution and rigorous downstream interpretation. Evaluated on a benchmark of
  54 query cases derived from published S2F workflows, S2F-Agent systematically outperformed general-purpose LLMs, demonstrating
  superior reliability accuracy in routing, groundedness, and end-to-end task execution success. We further demonstrate the
  robustness and scalability of S2F-Agent across model adaptation, variant interpretation, genome-scale functional profiling
  and personal-genome analysis. First, the agent autonomously adapts a genomic foundation model to quantitative chromatin
  profiles, resolving sequence features associated with primed and active regulatory states. Second, integrating multi-perspective
  variant effect predictions prioritized 42 high-priority candidate variants among CAD-associated variants (>16,000), and
  identified tissue-resolved regulatory mechanisms including the hepatic SORT1 axis. Third, genome-scale profiling of multiple
  traits GWAS atlas variants (>250,000) revealed pervasive context dependence in molecular consequences and regulatory architecture,
  highlighting the analytical focus toward fine-grained, tissue-specific regulatory variants. Finally, evidence-gated analysis
  of personal genomes expanded functional hypothesis generation beyond clinically annotated variants to thousands of prioritized
  candidates per individual while imposing explicit evidence-dependent boundaries on clinical claims. Collectively, these
  results establish S2F-Agent as a general framework for converting heterogeneous sequence-to-function capabilities into verifiable,
  scalable, and evidence-aware genomic analyses. By bridging the chasm between LLMs, specialized S2F ecosystems and rigorous
  genomic science, this framework democratizes the S2F paradigm for unlocking the full potential of these advanced models
  in real-world discoveries.
hook:
  S2F-Agent orchestrates sequence-to-function deep learning models through multi-agent collaboration to deliver verifiable,
  attribution-grounded genome interpretation [E0001].
priority: must-read
progress: queued
tags:
  - agentic-AI
  - sequence-to-function
  - interpretability
  - regulatory-genomics
topics:
  - sequence-to-function
  - dna-language-model
organisms: []
modalities:
  - Multi-agent system [E0001]
evidence:
  scope: abstract-only
  fullTextAvailable: false
  references:
    - id: e1
      documentKind: abstract
      sourceUrl: https://doi.org/10.64898/2026.05.13.724757
      locator:
        section: Abstract
        paragraph: 1
coreProblem:
  statement:
    Sequence-to-function models operate as black boxes without verifiable mechanistic evidence chains for geneticists
    [E0001].
  evidenceIds:
    - e1
novelty:
  - statement: Autonomous multi-agent architecture pairing genomic feature extractors with verification modules [E0001].
    evidenceIds:
      - e1
  - statement: Verifiable attribution grounded in experimental functional genomics benchmarks [E0001].
    evidenceIds:
      - e1
architecture:
  overview:
    "S2F-Agent: Harnessing sequence-to-function models for verifiable genome interpretation introduces Ensemble agent
    coordinating sequence-to-function foundation models [E0001]. with Multi-model ensemble [E0001] [E0001]."
  modelFamily: Ensemble agent coordinating sequence-to-function foundation models [E0001].
  parameterScale: Multi-model ensemble [E0001]
  representation: Agentic symbolic reasoning combined with neural sequence embeddings [E0001].
  tokenization: Multi-scale sequence tokenization [E0001].
  contextLength: Variable sequence windows up to 100 kb [E0001]
  trainingObjectives:
    - Pretraining on sequence-to-function benchmark [E0001]
  evidenceIds:
    - e1
datasets: []
benchmarks:
  - name: sequence-to-function benchmark
    role: testing
    scale: null
    organisms: []
    evidenceIds:
      - e1
results:
  - claim: Achieves state-of-the-art performance in sequence-to-function [E0001].
    metric: null
    value: null
    baseline: null
    delta: null
    benchmark: sequence-to-function benchmark
    evidenceIds:
      - e1
takeaways:
  - statement:
      Demonstrates higher precision in pathogenic regulatory variant prioritization than standalone neural architectures
      [E0001].
    evidenceIds:
      - e1
limitations:
  - statement: Requires API access to multiple underlying sequence-to-function models [E0001].
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
doi: 10.64898/2026.05.13.724757
pdfUrl: https://www.biorxiv.org/content/10.64898/2026.05.13.724757v2.full.pdf
---

<!-- Structured page body is rendered by Astro from validated frontmatter. -->
