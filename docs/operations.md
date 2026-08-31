# Operations runbook

## Safety boundary

All literature operations run from private `Kuanhao-Chao/DeepGeno.watch-state` using
the exact public engine commit recorded in its root `engine.lock.json`. The public
`Kuanhao-Chao/DeepGeno.watch` repository contains code and approved output only; its
only GitHub Actions workflow is CI. Cloudflare remains connected only to the public
repository.

Do not provision from an implementation branch. First merge the reviewed public
implementation, require a green `CI / verify`, and use a clean standard clone whose
HEAD equals public `main`.

## Provision the private companion

The repeatable setup path is:

```bash
./scripts/setup-private-ops.sh
```

Do not execute it from automation. It deliberately opens browser pages and waits at
human confirmation gates. The current local GitHub CLI 0.11.0 is unsupported; install a
current `gh`, restart the shell (`hash -r`), authenticate it manually as
`Kuanhao-Chao`, and rerun the wizard. The wizard itself never changes GitHub CLI or Git
configuration.

The eight stages are:

1. Verify Git, Node.js 22+, authenticated account identity, and the actual `gh secret`,
   `variable`, `workflow`, and `run` subcommands before any mutation.
2. Create an empty private `Kuanhao-Chao/DeepGeno.watch-state`, or validate that an
   existing repository has the exact owner/name, remains private, is neither forked nor
   archived, and uses `main` once seeded.
3. Resolve public `main` to a literal 40-hex commit, require a clean matching public
   checkout, clone the companion as the canonical sibling, render eight allowlisted
   files plus `engine.lock.json`, and non-force push only the confirmed exact paths.
   Repinning is separately confirmed and may change only the lock.
4. Configure private repository variables and the protected `synthesis` environment.
5. Create one curator GitHub App with webhook disabled; Metadata read and Contents,
   Pull requests, and Issues read/write; no other access; owner `Kuanhao-Chao`; and an
   installation selecting exactly the private and public repositories.
6. Store the App Client ID as a private-repository variable and stream its downloaded
   PEM by stdin into the private-repository secret. Remove the local PEM manually after
   GitHub confirms it; the wizard never copies, prints, or deletes the key.
7. Dispatch and watch one new private preflight run at current private `main`; it must
   prove the App can mint separate one-repository tokens with the production permission
   unions.
8. Review a non-mutating cutover checklist. Model probing, live discovery, human gate
   merges, public branch rules, and daily enablement remain Task 5 actions.

The renderer targets a standard clone on one filesystem under one trusted operator.
Linked-worktree `.git` files, cross-filesystem atomic moves, hardlinks, and hostile
concurrent local path swaps are unsupported and fail closed where detectable.

## Required private configuration

Repository variables on `DeepGeno.watch-state`:

- `DEEPGENO_PUBLIC_APP_CLIENT_ID`
- `DEEPGENO_PUBLIC_REPOSITORY=Kuanhao-Chao/DeepGeno.watch`
- `DEEPGENO_CURATOR_GITHUB_LOGIN=Kuanhao-Chao`
- `DEEPGENO_MAX_SUMMARIES_PER_RUN=1` during activation (`20` normal ceiling)
- `DEEPGENO_LIVE_INGESTION_ENABLED=false` until first publication succeeds
- optional `CROSSREF_MAILTO`

Repository secrets:

- `DEEPGENO_PUBLIC_APP_PRIVATE_KEY`
- optional browser-entered `OPENALEX_API_KEY`

Protected `synthesis` environment variables:

- `DEEPGENO_MODEL_PROVIDER=openai`
- `DEEPGENO_MODEL_NAME=gpt-5.6-terra`
- `DEEPGENO_MODEL_MAX_OUTPUT_TOKENS=5000`

The initial protected environment contains exactly the browser-entered
`OPENAI_API_KEY`; `ANTHROPIC_API_KEY` is the mutually exclusive alternative for an
explicit future provider switch. Private-repository environment secrets and variables
require an eligible paid GitHub plan. If those controls are unavailable, stop and
upgrade; never fall back to repository-level or public provider secrets. Restrict the
environment to `main`. Required reviewers are conditional on private-repository plan
support; add the curator when available. Leave **Prevent self-review** disabled in this
single-curator topology so the curator who initiated a run can approve it instead of
deadlocking the only approval path.

`GH_TOKEN` and `DEEPGENO_PUBLIC_GITHUB_TOKEN` are short-lived workflow values, not
stored secrets. After validated cutover, remove any legacy public
`DEEPGENO_GITHUB_TOKEN` manually in the public repository’s Settings UI.

## Private workflow map

- **Literature ingestion** runs at 06:17 `America/Los_Angeles` and supports manual,
  replay, explicit windows, bounded backfill, and shadow inputs. Scheduled mutation is
  possible only when `DEEPGENO_LIVE_INGESTION_ENABLED` is exactly `true`.
- **Literature review validation** uses `pull_request_target`, reads event data, and
  checks out only literal private `main` without App or provider secrets. It validates
  immutable markers and exactly one decision per item.
- **Literature synthesis and publication** records trusted merged reviews, serializes
  private state, performs selected model calls in the protected environment, opens
  private Gate 2 PRs, seals approved output, and uses a separate public-only token to
  open or reconcile one-file public PRs.
- **Private operations preflight** fetches the literal engine pin and proves that the
  private and public App tokens each enumerate exactly one expected repository with the
  same permission unions used by production jobs.

## Controlled first publication

Keep live scheduling disabled. After the companion and App preflight are green:

1. Probe the configured OpenAI model without generating a summary.
2. Run non-shadow discovery with `from=2026-08-28`, `through=2026-08-28`,
   `batch_days=1`, `backfill_days=0`, and `mode=manual`. Require zero source issues.
3. Summarize only `paper-1aeb281eb0343b8b`. If it is absent, stop before synthesis.
   Apply the approved seven-day deferrals and dismissals from the activation plan;
   defer any unknown new candidate for seven days.
4. Merge Gate 1 and Gate 2 only after their validations pass. Confirm approval creates
   a sealed release and a public PR changing exactly one paper Markdown file.
5. A human merges the public PR. Require `CI / verify`, a successful Cloudflare
   deployment, and production catalog growth from zero to one.
6. Only then set `DEEPGENO_LIVE_INGESTION_ENABLED=true`. Observe three daily cycles
   before increasing the summary ceiling; backfill in sequential bounded batches.

Public `main` must be pull-request-only with required `CI / verify` and no curator-App
bypass. Do not require the conditional Cloudflare check as a universal context; verify
it explicitly on publication merges.

## Daily checks and recovery

- Compare candidate volume with the rolling baseline and inspect discontinuities.
- Require complete abstracts, relevance reasons, unique canonical IDs, and advancing
  overlap-aware source checkpoints.
- Model calls must equal newly selected papers plus explicit revisions.
- Every private summary PR must show its evidence scope; every public delivery must be
  one regular Markdown file with a matching sealed digest.
- Re-run missed windows explicitly and sequentially. Discovery, synthesis, publication,
  and delivery reconciliation are idempotent; never edit checkpoints, releases, or
  receipts by hand to hide a failure.
- A closed unmerged Gate PR records no transition. An existing draft or sealed release
  is reused on retry. Ambiguous remote delivery is reconciled before another write.

For source incidents, record the source, last success, HTTP status category, and retry
count without including raw abstracts, evidence, tokens, or credentials.
