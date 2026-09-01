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

1. Dispatch the read-only model probe and watch that exact run to completion. It makes
   one OpenAI model-metadata `GET`, no generation request, and no state commit:

   ```bash
   gh workflow run summarize.yml --repo Kuanhao-Chao/DeepGeno.watch-state --ref main -f operation=probe-model
   gh run list --repo Kuanhao-Chao/DeepGeno.watch-state --workflow summarize.yml --event workflow_dispatch --limit 1
   gh run watch RUN_ID --repo Kuanhao-Chao/DeepGeno.watch-state --exit-status
   ```

2. Before discovery, create
   `data/private/activation/controlled-scan.json` on private `main` from the approved
   private activation handoff and commit it only to `DeepGeno.watch-state`. The strict
   shape is `schemaVersion`, `unknownCandidateAction: "defer"`, and a `decisions` array
   of `{ "paperId": "paper-…", "action": "summarize|defer|dismiss" }`. It must contain
   exactly 1 summarize, 9 defer, and 4 dismiss decisions. Never copy the private
   decision list into the public repository.

3. Dispatch the fixed, non-shadow discovery and watch its exact run. Require zero
   source issues and one Gate 1 pull request:

   ```bash
   gh workflow run ingest.yml --repo Kuanhao-Chao/DeepGeno.watch-state --ref main -f mode=manual -f from=2026-08-28 -f through=2026-08-28 -F backfill_days=0 -F batch_days=1 -F shadow=false
   gh run list --repo Kuanhao-Chao/DeepGeno.watch-state --workflow ingest.yml --event workflow_dispatch --limit 1
   gh run watch RUN_ID --repo Kuanhao-Chao/DeepGeno.watch-state --exit-status
   ```

4. In a clean private clone, check out the new Gate 1 branch and compile its generated
   review body with the pinned public engine. Substitute the literal absolute roots and
   generated review path reported by discovery:

   ```bash
   gh pr checkout GATE_1_PR_NUMBER --repo Kuanhao-Chao/DeepGeno.watch-state
   node /ABSOLUTE/PUBLIC/ROOT/scripts/github/prepare-controlled-scan.mjs \
     --state-root /ABSOLUTE/PRIVATE/ROOT \
     --manifest data/private/activation/controlled-scan.json \
     --review data/private/reviews/GENERATED_GATE_1.md \
     --output data/private/reviews/GENERATED_GATE_1-controlled.md \
     --expect-summarize 1 \
     --expect-defer 9 \
     --expect-dismiss 4
   gh pr edit GATE_1_PR_NUMBER --repo Kuanhao-Chao/DeepGeno.watch-state --body-file /ABSOLUTE/PRIVATE/ROOT/data/private/reviews/GENERATED_GATE_1-controlled.md
   gh pr checks GATE_1_PR_NUMBER --repo Kuanhao-Chao/DeepGeno.watch-state --watch
   ```

   The compiler rejects wrong plan counts, malformed review controls, path/symlink
   escapes, and a missing selected paper; it defers every unknown candidate for seven
   days and reports known non-selected papers that were absent. Use the generated file
   as the Gate 1 pull-request body, let review validation pass, inspect the diff, and
   merge Gate 1 as the curator. Only `paper-1aeb281eb0343b8b` may be summarized; if it
   is absent, stop before synthesis.

5. Synthesis persists and pushes `prepared`, then a one-use `armed` state before the
   paid call. A provider timeout becomes `ambiguous` and blocks automatic retry. Review
   and approve the protected `synthesis` environment deployment, then inspect the
   resulting private Gate 2 pull request.
6. Before approving Gate 2, enable Cloudflare Access for Worker Preview URLs. Verify an
   intended reviewer can enter and an unauthenticated preview request is denied.
7. Merge Gate 2 only after its validation and the Preview Access check pass. Confirm
   approval creates a sealed release and a public PR changing exactly one paper Markdown
   file.
8. A human merges the public PR. Require `CI / verify`, a successful Cloudflare
   deployment, and production catalog growth from zero to one.
9. Only then set `DEEPGENO_LIVE_INGESTION_ENABLED=true`. Observe three daily cycles
   before increasing the summary ceiling; backfill in sequential bounded batches.

Public `main` must be pull-request-only with required `CI / verify` and no curator-App
bypass. Do not require the conditional Cloudflare check as a universal context; verify
it explicitly on publication merges.

## Daily checks and recovery

- Compare candidate volume with the rolling baseline and inspect discontinuities.
- Require complete abstracts, relevance reasons, unique canonical IDs, and advancing
  overlap-aware source checkpoints.
- Model calls must equal newly selected papers plus explicit revisions.
- Every Draft Summary PR must show its evidence scope; every public delivery must be
  one regular Markdown file with a matching sealed digest.
- Re-run missed windows explicitly and sequentially. Discovery, synthesis, publication,
  and delivery reconciliation are idempotent; never edit checkpoints, releases, or
  receipts by hand to hide a failure.
- A closed unmerged Gate PR records no transition. An existing draft or sealed release
  is reused on retry. Ambiguous remote delivery is reconciled before another write.

### Ambiguous synthesis recovery

Do not rerun synthesis while its durable request is `armed`, `dispatching`, or
`ambiguous`. Inspect the private request record and the provider request history first.
If a completed provider response exists, stop and preserve the request; do not
reconcile it into another paid call. If provider records confirm no usable
completion—or the curator explicitly accepts the duplicate-charge risk—run a
compare-and-swap reconciliation from the clean public root with its matching private
clone:

```bash
npm run --silent literature -- reconcile-synthesis \
  --project-root /ABSOLUTE/PUBLIC/ROOT \
  --state-root /ABSOLUTE/PRIVATE/ROOT \
  --request SYNTHESIS_REQUEST_ID \
  --expected-updated-at EXACT_UPDATED_AT_FROM_PRIVATE_RECORD \
  --note "Provider records checked; no usable completed response exists."
```

Commit and push only the reported private synthesis-request path. A stale timestamp or
empty note fails closed. Then redispatch `summarize.yml` with `operation=synthesize`
and the original `paper_id`; the stable request ID is also sent as the OpenAI
idempotency key. The raw one-use execution token is never stored in Git.

```bash
gh workflow run summarize.yml --repo Kuanhao-Chao/DeepGeno.watch-state --ref main -f operation=synthesize -f paper_id=ORIGINAL_PAPER_ID
```

For source incidents, record the source, last success, HTTP status category, and retry
count without including raw abstracts, evidence, tokens, or credentials.
