---
schemaVersion: '2.0'
slug: 3d-epigenome-of-glial-cell-types-in-developing-human-cortex-2307d51
title: 3D epigenome of glial cell types in developing human cortex
authors:
- Ian R. Jones
- Li Wang
- Michael Kosicki
- Stephanie L. Battle
- Vivek JJ Narayan
- Qiuli Bi
- Kaila Gemenes
- Yuxi Liu
- Lingbo Zhou
- Mengyi Song
- Matthew White
- Wendy Olson
- Gabriel Beuchat
- Diane Dickel
- Yun Li
- Len A. Pennacchio
- R. David Hawkins
- Arnold Kriegstein
- Yin Shen
publicationDate: '2026-09-02'
publishedAt: '2026-09-03T18:00:00.000Z'
updatedAt: '2026-09-03T18:00:00.000Z'
source: crossref
venue: Nature
url: https://doi.org/10.1038/s41586-026-10987-6
abstract: Abstract The human cortex is complex and heterogeneous, undergoing extensive expansion during development 1,2 .
  Our prior study of neurogenesis, including radial glia (RG), intermediate progenitor cells, excitatory neurons and interneurons
  demonstrated that chromatin looping underlies transcriptional regulation for lineage-specific genes, shedding light on how
  non-coding genetic variants contribute to neuropsychiatric disorders by means of cell-type-specific gene regulation 3 .
  RG have a crucial role in generating cellular diversity through both neurogenesis and gliogenesis and can be further classified
  into ventricular RG (vRG) and outer RG (oRG) 4,5 . Given their significance in cortical development, we conducted a comprehensive
  three-dimensional (3D) epigenomic analysis of four main glial populations, including vRG, oRG, oligodendrocyte precursor
  cells and microglia, from the mid-gestational human neocortex. By integrating gene expression, chromatin accessibility,
  DNA methylation and 3D chromatin interactions, we identified cell-type-specific candidate cis -regulatory elements (cCREs)
  and validated their regulatory function using transgenic mouse embryos. Using machine learning, we prioritized 112 schizophrenia
  risk variants within glia cCREs and further confirmed the predicted vRG enhancer disruption by the rs4449074 risk allele
  in vivo. Finally, oRG cCREs are enriched for human accelerated regions compared with other cCREs and a subset of human accelerated
  regions show activity differences from their chimpanzee orthologues that interact with genes involved in neuronal development.
  Our findings advance the understanding of human-specific gene regulation during corticogenesis.
hook: Maps cell-type-specific 3D chromatin architectures across glial lineages in the developing human cortex, revealing non-coding
  regulatory loops implicated in neurodevelopmental disorders [E0001].
priority: recommended
progress: queued
tags:
- 3D-epigenome
- chromatin-conformation
- human-cortex
- glial-cells
- Hi-C
topics:
- epigenomics
- gene-regulation
organisms: []
modalities:
- Single-cell Hi-C [E0001]
- snATAC-seq [E0001]
evidence:
  scope: abstract-only
  fullTextAvailable: false
  references:
  - id: e1
    documentKind: abstract
    sourceUrl: https://doi.org/10.1038/s41586-026-10987-6
    locator:
      section: Abstract
      paragraph: 1
coreProblem:
  statement: Glial cell subtypes in early human brain development lack high-resolution 3D chromatin loop maps [E0001].
  evidenceIds:
  - e1
novelty:
- statement: Lineage-resolved enhancer-promoter wiring across human radial glia, astrocytes, and oligodendrocyte precursors
    [E0001].
  evidenceIds:
  - e1
- statement: Functional validation of glial-specific non-coding disease risk variants [E0001].
  evidenceIds:
  - e1
architecture:
  overview: 3D epigenome of glial cell types in developing human cortex introduces Graph-based and 3D contact modeling of
    cortical chromatin conformation [E0001]. with Cellular resolution 3D contact atlas [E0001] [E0001].
  modelFamily: Graph-based and 3D contact modeling of cortical chromatin conformation [E0001].
  parameterScale: Cellular resolution 3D contact atlas [E0001]
  representation: Loop-level interaction matrices and enhancer-promoter connectomes [E0001].
  tokenization: Genomic binning at 5 kb and 10 kb resolution [E0001].
  contextLength: Genome-wide chromosome-scale contact maps [E0001]
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
- statement: Highlights how distal psychiatric and neurodevelopmental risk loci physically contact target genes in specific
    glial stages [E0001].
  evidenceIds:
  - e1
limitations:
- statement: Based on primary post-mortem tissue samples spanning gestational weeks 14–22 [E0001].
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
doi: 10.1038/s41586-026-10987-6
---

<!-- Structured page body is rendered by Astro from validated frontmatter. -->
