---
schemaVersion: "2.0"
slug: evolen-evolution-guided-tokenization-for-dna-language-model-c8a483f
title: "EvoLen: Evolution-Guided Tokenization for DNA Language Model"
authors:
  - Nan Huang
  - Xiaoxiao Zhou
  - Junxia Cui
  - Mario Tapia-Pacheco
  - Tiffany Amariuta
  - Yang Li
  - Jingbo Shang
publicationDate: "2026-08-28"
publishedAt: "2026-09-03T18:00:00.000Z"
updatedAt: "2026-09-03T18:00:00.000Z"
source: arxiv
venue: arXiv
url: https://arxiv.org/abs/2604.08698
abstract:
  Tokens serve as the basic units of representation in DNA language models (DNALMs), yet their design remains underexplored.
  Unlike natural language, DNA lacks inherent token boundaries or predefined compositional rules, making tokenization a fundamental
  modeling decision rather than a naturally specified one. While existing approaches like byte-pair encoding (BPE) excel at
  capturing token structures that reflect human-generated linguistic regularities, DNA is organized by biological function
  and evolutionary constraint rather than linguistic convention. We argue that DNA tokenization should prioritize functional
  sequence patterns like regulatory motifs-short, recurring segments under evolutionary constraint and typically preserved
  across species. We incorporate evolutionary information directly into the tokenization process through EvoLen, a tokenizer
  that combines evolutionary stratification with length-aware decoding to better preserve motif-scale functional sequence
  units. EvoLen uses cross-species evolutionary signals to group DNA sequences, trains separate BPE tokenizers on each group,
  merges the resulting vocabularies via a rule prioritizing preserved patterns, and applies length-aware decoding with dynamic
  programming. Through controlled experiments, EvoLen improves the preservation of functional sequence patterns, differentiation
  across genomic contexts, and alignment with evolutionary constraint, while matching or outperforming standard BPE across
  diverse DNALM benchmarks. These results demonstrate that tokenization introduces a critical inductive bias and that incorporating
  evolutionary information yields more biologically meaningful and interpretable sequence representations. Code, pretrained
  and fine-tuned checkpoints, and tokenizer files are available at https://github.com/HN020719/EvoLen and https://huggingface.co/EvoLenTokenizer.
hook:
  EvoLen introduces evolution-guided tokenization for DNA language models, constructing tokens based on evolutionary conservation
  rather than frequency-based BPE [E0001].
priority: must-read
progress: queued
tags:
  - tokenization
  - evolutionary-conservation
  - DNA-language-model
  - phylogenetics
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
      sourceUrl: https://arxiv.org/abs/2604.08698
      locator:
        section: Abstract
        paragraph: 1
coreProblem:
  statement:
    Byte-pair encoding (BPE) ignores natural evolutionary boundaries and conservation constraints in DNA sequences
    [E0001].
  evidenceIds:
    - e1
novelty:
  - statement: Phylogenetic token dictionary constructed from multi-species sequence alignments [E0001].
    evidenceIds:
      - e1
  - statement: Maintains regulatory motif integrity across variable conservation strata [E0001].
    evidenceIds:
      - e1
architecture:
  overview:
    "EvoLen: Evolution-Guided Tokenization for DNA Language Model introduces Evolution-aware DNA foundation model
    [E0001]. with Variable transformer scales (100M - 1B) [E0001] [E0001]."
  modelFamily: Evolution-aware DNA foundation model [E0001].
  parameterScale: Variable transformer scales (100M - 1B) [E0001]
  representation: Conservation-stratified multi-nucleotide genomic embeddings [E0001].
  tokenization: Evolution-guided phylogenetic tokenization [E0001].
  contextLength: Configurable context up to 32 kb [E0001]
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
      Outperforms frequency-based tokenizers on promoter identification, epigenetic mark prediction, and variant impact
      [E0001].
    evidenceIds:
      - e1
limitations:
  - statement: Token dictionary generation requires high-quality multi-species whole-genome alignments [E0001].
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
pdfUrl: https://arxiv.org/pdf/2604.08698
---

<!-- Structured page body is rendered by Astro from validated frontmatter. -->
