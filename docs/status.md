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

## Account-level activation remaining

These require the owner's credentials or external account choices and are intentionally
not performed by local implementation:

1. Push to a private GitHub remote and configure Actions permissions/ruleset bypass.
2. Create the `synthesis` environment and add the selected provider/model variables and
   provider API key.
3. Run three shadow discovery days, inspect coverage/ranking, then enable live Gate 1.
4. Connect the repository to Cloudflare Pages, configure build watch paths, protect
   previews, and attach the production domain.
5. Run the bounded 90-day backfill after daily review volume is acceptable.

## Next extensions after activation

Weekly email digests, author/repository tracking, semantic/vector retrieval across the
approved catalog, citation/version alerts, and curator analytics are deliberately kept
outside the first production slice until the daily two-gate loop has real operating
data.
