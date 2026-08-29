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
- Wrangler 4 is pinned locally and Cloudflare OAuth is valid. Cloudflare contains an
  existing `deepgeno-watch` Worker but no Pages project. Its two 2026-08-28 deployments
  are dashboard-template placeholders; no Git-built Astro artifact has reached
  production yet.
- The repository deployment contract has been migrated from the incompatible
  Pages-only `pages_build_output_dir` field to an asset-only Worker with explicit
  static directory, HTML routing, custom 404, `workers.dev`, and preview URLs. The
  unified local/CI check now includes a static-artifact verification and Wrangler dry
  run.
- Commit `f1a63f8` passed both `CI / verify` and `Workers Builds: deepgeno-watch`.
  Cloudflare build `01252de0-d44b-4e26-9cd5-59c87ce9078f` deployed Worker version
  `45a442fc-89eb-4e50-b7ba-b446f32d87e8` to
  `https://deepgeno-watch.khchao.workers.dev`. All catalog/feed routes return 200, the
  generated unknown-route page returns 404, canonical URLs are consistent, security
  headers are active, and hashed Astro assets receive the immutable cache policy.
- Preview URLs are enabled and automatically emit `X-Robots-Tag: noindex`. Preview
  Access protection still needs to be enabled in the Cloudflare dashboard. The initial
  synthesis ceiling is now 1; scheduled live ingestion remains disabled.

## Activation remaining

These still require an external account choice or a deliberately later rollout gate:

1. Configure the documented build watch paths and enable Cloudflare Access for Worker
   Preview URLs.
2. Add the active provider key, compare `gpt-5.6-terra` with `claude-sonnet-5`, then retain the selected
   provider/model variables and exactly one provider API key.
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
