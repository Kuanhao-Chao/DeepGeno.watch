# Operations runbook

## Repository activation

1. Create a **private** GitHub repository with `main` as the default branch and push
   this workspace. The automation refuses to run when the event payload says the
   repository is public.
2. In **Settings → Actions → General**, allow Actions to read/write repository contents
   and create pull requests. If a ruleset protects `main`, give the trusted literature
   automation a narrowly scoped bypass; the state machine commits private checkpoints
   and decisions directly to `main` before opening review-only branches.
3. Create a GitHub environment named `synthesis`. Add environment variables
   `DEEPGENO_MODEL_PROVIDER`, `DEEPGENO_MODEL_NAME`, and optionally
   `DEEPGENO_MODEL_MAX_OUTPUT_TOKENS` (default `5000`). Add only the corresponding
   `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` environment secret.
4. Add repository variable `DEEPGENO_MAX_SUMMARIES_PER_RUN` (default `20`) and optional
   `CROSSREF_MAILTO`. Add optional repository secret `OPENALEX_API_KEY`.
5. Optional: add a fine-grained repository secret named `DEEPGENO_GITHUB_TOKEN` with
   contents, issues, and pull-request write access. Without it, PRs created by the
   built-in token produce approval-required workflow runs; a maintainer must select
   **Approve workflows to run** on the first review run.
6. Require the `CI / verify` and
   `Literature review validation / Validate review choices` checks before merging
   review PRs. Closing a PR without merge remains the simplest way to abandon it
   without recording a new state transition.

## Workflow map

- `Literature ingestion` runs at 06:17 in `America/Los_Angeles` and supports manual,
  replay, explicit date-window, bounded 90-day backfill, and shadow inputs.
- `Literature review validation` reads the PR body from the event but checks out and
  executes only `main`. It validates immutable markers, exactly one action per item,
  approval status choices, revision feedback, and synthesis fan-out.
- `Literature synthesis and publication` records merged decisions, serializes all
  private-state pushes, runs selected LLM calls one at a time, opens one Gate 2 PR per
  draft, creates requested revisions, and publishes only approved drafts.

## Initial rollout

1. Run discovery in shadow mode for three days. Inspect coverage, duplicates, complete
   abstracts, ranking reasons, and source latency without opening PRs.
2. Run one manually selected paper through OpenAI and one through Anthropic. Do not use
   silent failover; compare the structured drafts and record the chosen production
   provider/model explicitly.
3. Connect Cloudflare Pages, configure build watch paths, and protect previews.
4. Enable live candidate PR creation and operate the daily loop until review volume is
   predictable.
5. Backfill the previous 90 days in no more than 30-day batches. Merge or close each
   candidate PR before proceeding when review load becomes uncomfortable.

## Daily checks

- Candidate count is normally 10–30; zero or a large discontinuity deserves inspection.
- Every candidate has its full abstract and a visible relevance explanation.
- No paper receives multiple canonical IDs for the same normalized DOI.
- Source checkpoints advance, with configured overlap retained.
- Model call count equals newly selected papers plus explicit revisions.
- Every summary PR reports evidence scope and passes schema/privacy/build checks.

## Recovery

Discovery and synthesis commands are idempotent and accept explicit windows or paper
IDs. Re-run a missed date window with `workflow_dispatch`; overlap and upsert prevent
duplicate candidates. A failed synthesis can be retried for its paper ID. For a failed
requested revision, also pass the prior draft ID as `revision_of`; the same evidence
digest and revision feedback are reused. Never hand-edit checkpoints merely to hide a
stale-source alert.

A candidate review PR closed without merge is reopened on the next identical discovery
run. A model draft committed before PR creation is reused without another model call.
All literature-state workflow runs share one non-canceling concurrency group.

## Alerts

Treat a source as stale when its checkpoint has not advanced across three scheduled
runs. File a GitHub issue with the source, last successful instant, HTTP status category,
and retry count; do not include raw abstracts or credentials.
