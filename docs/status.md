# Implementation status

Last updated: 2026-08-28

## Implemented

- TypeScript/npm monorepo with shared strict Zod contracts.
- bioRxiv, arXiv OAI (`q-bio`, `cs.LG`, `stat.ML`), and Crossref journal discovery.
- Europe PMC core journal discovery/open-access JATS and OpenAlex DOI enrichment.
- Per-source cursor checkpoints, configured overlap, canonical DOI/title deduplication,
  unique source provenance, complete-abstract gating, token-boundary lexical ranking,
  an explicit computational-signal gate, and topic taxonomy.
- Private Git-backed Candidate, decision, Draft Summary, evidence, checkpoint, and
  publication state.
- Gate 1 Candidate PRs with exactly Summarize, Defer, or Dismiss; expired deferrals
  resurface without relying on upstream repetition.
- Strict structured-output OpenAI Responses and Anthropic Messages adapters with no
  model tools, no silent failover, explicit model identity, token accounting, and
  output-token limits.
- Gate 2 approval, revision-with-feedback, and dismissal. Approval records Priority and
  Progress; revision creates a new immutable evidence-linked draft.
- Astro static catalog, reading-list view, deep technical pages, query-string search and
  filtering, RSS, JSON catalog, responsive/dark styling, and security headers.
- Serialized GitHub workflows for scheduled/manual discovery, review validation,
  bounded synthesis, retry/revision, public projection, build, and privacy checks.
- Automated contract, lifecycle, provider, source-adapter, HTTP-boundary, workflow, and
  privacy tests.

## Verified locally

- All workspace TypeScript/Astro checks pass with zero diagnostics.
- All automated tests pass.
- Workflow and Dependabot files parse as valid YAML.
- Both the zero-publication site and a temporary fully populated approved-paper fixture
  build successfully; deep detail, JSON, and RSS outputs were exercised. The fixture
  was removed, and the privacy scanner inspects the generated artifact.
- A live isolated 2026-08-27 discovery run completed in roughly 90 seconds with 14
  Candidates and zero source issues after narrowing arXiv to its category-level OAI
  sets. The audited batch had no incomplete abstracts or repeated source-record keys;
  known descriptive wet-lab false positives were excluded while key DNA, RNA, protein,
  single-cell, variant-effect, and sequence-to-function papers remained.

## Activated

- Private GitHub repository `Kuanhao-Chao/DeepGeno.watch` is connected and the verified
  baseline is on `main`.
- Actions has repository write/PR permission. The `synthesis` environment, 5,000-token
  ceiling, 20-summary ceiling, and Crossref polite-pool contact are configured.
- GitHub CI passed on the baseline. Three dated remote shadow windows (2026-08-26
  through 2026-08-28) completed with 8 Candidates each, zero source warnings, no
  repository mutation, and no LLM call. Those runs exposed the upstream compatibility
  and latency improvements now covered by regression tests.
- The tuned commit `67a4b32` passed remote CI and repeated the 2026-08-27 shadow window
  in 1 minute 33 seconds with 14 Candidates, zero source warnings, no mutation, and no
  model call.
- Wrangler 4 is pinned locally and Cloudflare OAuth is valid; no Pages project has been
  created, preserving the required Git-integration choice. The first Git-integrated
  create request stopped safely with Cloudflare error `8000011`; the Cloudflare Workers
  and Pages GitHub App must be repaired or reauthorized before retrying.

## Activation remaining

These still require an external account choice or a deliberately later rollout gate:

1. Add the selected provider/model variables and exactly one provider API key after
   comparing one OpenAI and one Anthropic draft.
2. Repair the Cloudflare Workers and Pages GitHub App connection, then connect the
   repository to Pages, configure build watch paths, protect previews, and attach the
   production domain.
3. After the model and site are ready, set `DEEPGENO_LIVE_INGESTION_ENABLED=true` and
   run one explicit manual live Gate 1 discovery.
4. Run the bounded 90-day backfill after daily review volume is acceptable.

GitHub Free does not provide branch protection for a private repository. Required-check
branch rules therefore remain unavailable unless the account upgrades; making the
repository public is not an acceptable workaround. The lifecycle still revalidates
every Gate 1 and Gate 2 decision before any synthesis or publication side effect.

## Next extensions after activation

Weekly email digests, author/repository tracking, semantic/vector retrieval across the
approved catalog, citation/version alerts, and curator analytics are deliberately kept
outside the first production slice until the daily two-gate loop has real operating
data.
