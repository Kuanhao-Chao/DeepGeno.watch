# Implementation status

Last updated: 2026-08-28

## Implemented

- TypeScript/npm monorepo with shared strict Zod contracts.
- bioRxiv, arXiv OAI (`q-bio`, `cs.LG`, `stat.ML`), and Crossref journal discovery.
- Europe PMC core journal discovery/open-access JATS and OpenAlex DOI enrichment.
- Per-source cursor checkpoints, configured overlap, canonical DOI/title deduplication,
  complete-abstract gating, lexical relevance ranking, and topic taxonomy.
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
- A live isolated 2026-08-28 discovery run completed with 8 Candidates and zero source
  issues after validating the canonical arXiv endpoint, bioRxiv empty-day behavior,
  Crossref created-date cursors, host pacing, and bounded 429 retries.

## Activated

- Private GitHub repository `Kuanhao-Chao/DeepGeno.watch` is connected and the verified
  baseline is on `main`.
- Actions has repository write/PR permission. The `synthesis` environment, 5,000-token
  ceiling, 20-summary ceiling, and Crossref polite-pool contact are configured.
- GitHub CI passed on the baseline. The first remote shadow run completed without any
  repository mutation or LLM call and exposed the source compatibility fixes now
  covered by regression tests.
- Wrangler 4 is pinned locally and Cloudflare OAuth is valid; no Pages project has been
  created, preserving the required Git-integration choice.

## Activation remaining

These still require an external account choice or a deliberately later rollout gate:

1. Add the selected provider/model variables and exactly one provider API key after
   comparing one OpenAI and one Anthropic draft.
2. Complete the three-day shadow period, inspect coverage/ranking, then set
   `DEEPGENO_LIVE_INGESTION_ENABLED=true` for live Gate 1.
3. Connect the repository to Cloudflare Pages, configure build watch paths, protect
   previews, and attach the production domain.
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
