export {
  createLiteratureLifecycle,
  type DecisionReport,
  type DiscoverCommand,
  type LiteratureCommand,
  type LiteratureLifecycle,
  type LiteratureLifecycleOptions,
  type Projection,
  type ProjectionRequest,
  type PublishCommand,
  type RunReport,
  type SynthesizeCommand,
} from "./lifecycle.js";
export { GitFileStateStore } from "./store.js";
export {
  PublicDeclassifier,
  renderPublicMarkdown,
  toPublicFrontmatter,
  type PublicProjection,
} from "./publication.js";
export { AllowlistedHttpClient, DEFAULT_SOURCE_HOSTS } from "./http.js";
export { BioRxivSource } from "./sources/biorxiv.js";
export { ArxivOaiSource } from "./sources/arxiv.js";
export { CrossrefIssnSource } from "./sources/crossref.js";
export { EuropePmcEnricher } from "./sources/europe-pmc.js";
export { EuropePmcSearchSource } from "./sources/europe-pmc-search.js";
export { OpenAlexDoiEnricher } from "./sources/openalex.js";
export { FixtureSource } from "./sources/fixture.js";
export { OpenAiStructuredModel } from "./models/openai.js";
export { AnthropicStructuredModel } from "./models/anthropic.js";
export { FakeStructuredModel } from "./models/fake.js";
export {
  parseCandidateReview,
  parseDraftReview,
  renderCandidateReview,
  renderDraftReview,
} from "./review.js";
export type {
  Enrichment,
  LiteratureSource,
  MetadataEnricher,
  SourceDocument,
  SourceFetchRequest,
  SourceFetchResult,
  StructuredModel,
} from "./ports.js";
