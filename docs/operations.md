# Operations runbook

## Current activation checkpoint

As verified on 2026-09-02, public production is healthy at commit
`1389302efb58dfcb5cee317110f5301dc4859b80`, the Worker returns HTTP 200, and
the catalog contains zero papers. The private companion exists and is pinned to that
commit, but it has no repository variables, repository secrets, environment variables,
environment secrets, or workflow runs. Public `main` is protected. Preview URL Access
has not yet been verified.

The implementation must be merged before provisioning continues. Never provision from
an implementation branch: use a clean standard clone whose HEAD equals public `main`.

## Safety boundary

All literature operations run from private `Kuanhao-Chao/DeepGeno.watch-state` using
the exact public engine commit recorded in root `engine.lock.json`. Public
`Kuanhao-Chao/DeepGeno.watch` contains code and approved output only. Cloudflare
Connect to Git remains attached only to the public repository.

The public DeepGeno.watch site is a read-only catalog. Candidate and summary decisions
are made in private GitHub pull requests, through either GitHub's web interface or the
`gh` terminal client. No browser-side write credential is shipped with the public site.

## Synchronize and configure the private companion

After the implementation pull request is merged, update the normal public clone and run:

```bash
git switch main
git pull --ff-only
./scripts/setup-private-ops.sh
```

The eight-stage wizard validates Git, Node.js 22+, GitHub CLI, authentication, the
public/private repository boundary, and a clean public checkout. For an existing
companion, it safely synchronizes only the eight generated wrapper files, repins
`engine.lock.json`, preserves `data/private/**`, and asks before its non-force push.
It then guides environment configuration, creates or validates a least-privilege
two-repository curator GitHub App, stores its client ID and key only in the private
repository, and dispatches one private preflight run.

The renderer supports a canonical sibling standard clone on one filesystem under one
trusted operator. Linked-worktree `.git` files, cross-filesystem atomic moves,
hardlinks, and hostile concurrent local path swaps are unsupported.

## Required private configuration

Repository variables on `DeepGeno.watch-state`:

- `DEEPGENO_PUBLIC_APP_CLIENT_ID`
- `DEEPGENO_PUBLIC_REPOSITORY=Kuanhao-Chao/DeepGeno.watch`
- `DEEPGENO_CURATOR_GITHUB_LOGIN=Kuanhao-Chao`
- `DEEPGENO_MAX_SUMMARIES_PER_RUN=1` during activation
- `DEEPGENO_LIVE_INGESTION_ENABLED=false` until the first publication succeeds
- optional `CROSSREF_MAILTO`

Repository secrets:

- `DEEPGENO_PUBLIC_APP_PRIVATE_KEY`
- optional browser-entered `OPENALEX_API_KEY`

Protected `synthesis` environment variables:

- `DEEPGENO_MODEL_PROVIDER=cloudflare-workers-ai`
- `DEEPGENO_MODEL_NAME=@cf/google/gemma-4-26b-a4b-it`
- `DEEPGENO_MODEL_MAX_OUTPUT_TOKENS=5000`
- `CLOUDFLARE_ACCOUNT_ID=<32-character account ID>`

The environment contains exactly one secret: `CLOUDFLARE_AI_API_TOKEN`.
`GH_TOKEN` and `DEEPGENO_PUBLIC_GITHUB_TOKEN` are short-lived workflow values, not
stored secrets.

Private-repository environment secrets and variables require an eligible GitHub plan.
If the controls are unavailable, stop; do not move the model token to repository scope
or the public repository. Select **Selected branches and tags** and add only `main`.
Do not use **Protected branches only** as a substitute. Required reviewers are optional
and plan-dependent; if the sole curator is a reviewer, leave **Prevent self-review**
disabled to avoid deadlocking the workflow.

## Browser setup: Workers AI and GitHub

The wizard walks through these steps, but they are written out here for recovery.

### 1. Create the Workers AI credential

1. Sign in to the Cloudflare dashboard and select the account that owns
   `deepgeno-watch`.
2. Open **Workers AI**.
3. Select **Use REST API**.
4. In **Get Account ID**, copy the 32-character Account ID. It is an identifier, not a
   secret.
5. Select **Create a Workers AI API Token**.
6. Review the prefilled account and permissions, select **Create API Token**, and then
   **Copy API Token**. If using a custom token, grant only account-scoped
   **Workers AI Read** and **Workers AI Edit**. Never use the Global API Key.
7. Keep the token in the browser/clipboard only long enough to complete the next
   section. Do not paste it into a terminal, chat, issue, commit, or public Worker
   setting.

Workers AI currently grants 10,000 free neurons per day and resets the allocation at
00:00 UTC. On Workers Free, requests over that allocation fail instead of creating paid
overage; on a paid account, verify the billing configuration before the probe. The
activation policy still permits at most one full summary per workflow run.

### 2. Configure the private GitHub environment

1. Open `Kuanhao-Chao/DeepGeno.watch-state` on GitHub.
2. Select **Settings → Environments → synthesis**.
3. Under **Deployment branches and tags**, choose **Selected branches and tags**.
4. Add the branch rule `main`; remove any broader branch or tag rule.
5. Under **Environment variables**, add the four variables listed above. The wizard can
   write these non-secret values for you.
6. Under **Environment secrets**, select **Add environment secret**.
7. Name it `CLOUDFLARE_AI_API_TOKEN`, paste the token directly from Cloudflare, and
   save it.
8. Remove old model-provider environment secrets. Confirm the environment has exactly
   the one Cloudflare token and the four expected variables.

The current remote environment has no values yet and is set to **Protected branches
only**; both facts must be corrected before the probe.

### 3. Protect Worker previews

Complete this before Gate 2 approval can create the first public preview:

1. In Cloudflare, open **Workers & Pages** and select `deepgeno-watch`.
2. Select the **Access** tab.
3. Select **Protect this Worker behind Access**. If prompted, finish the one-time Zero
   Trust account setup, then return to this tab.
4. Choose **Previews only** so production remains public.
5. Under **Authentication policy**, select or create an Allow policy containing only
   the curator identity.
6. Review the session duration and select **Apply Access**.
7. From **Deployments**, open a preview while signed in and confirm it loads.
8. Open the same preview in a private/incognito browser window and confirm Access
   challenges or denies the request.
9. Confirm `https://deepgeno-watch.khchao.workers.dev` still loads without signing in.

## Private workflow map

- **Literature ingestion** supports manual, replay, explicit-window, backfill, and
  shadow runs. A manual/replay live run with any source issue stops before state
  promotion or Gate 1. Scheduled runs may promote successful-source state while
  reporting issues so overlapping later windows can recover.
- **Literature review validation** reads private pull-request decisions but executes
  only literal trusted private `main`, without App or model credentials.
- **Literature synthesis and publication** records merged Gate 1 decisions, performs
  selected model calls in the protected environment, opens Gate 2, seals approved
  output, and opens a one-file public pull request with a public-only token.
- **Private operations preflight** proves that the App can mint separate one-repository
  tokens with the same permission unions used by production jobs.

## First activation: catch up through 2026-09-02

Keep `DEEPGENO_LIVE_INGESTION_ENABLED=false` throughout this sequence. If activation
occurs after 2026-09-02, keep `from=2026-09-01` and advance `through` to the current
date in bounded sequential batches.

### 1. Probe Workers AI

The probe sends one tiny structured request containing no paper, abstract, or evidence.
It consumes a small amount of the free allocation but performs no private-state write.

In the GitHub website:

1. Open the private repository's **Actions** tab.
2. Select **Literature synthesis and publication**.
3. Select **Run workflow**.
4. Choose branch `main`, operation `probe-model`, leave paper fields empty, and run.
5. Open that exact run and require **Probe configured model access** to pass.

From the terminal:

```bash
gh workflow run summarize.yml \
  --repo Kuanhao-Chao/DeepGeno.watch-state \
  --ref main \
  -f operation=probe-model
gh run list \
  --repo Kuanhao-Chao/DeepGeno.watch-state \
  --workflow summarize.yml \
  --event workflow_dispatch \
  --limit 3
gh run watch RUN_ID \
  --repo Kuanhao-Chao/DeepGeno.watch-state \
  --exit-status
```

Copy the new run ID shown by `gh run list`; do not reuse an older run.

### 2. Run a strict shadow discovery

In the GitHub website:

1. Select **Actions → Literature ingestion → Run workflow**.
2. Choose branch `main`.
3. Set `mode=manual`, `from=2026-09-01`, `through=2026-09-02`,
   `backfill_days=0`, `batch_days=1`, and `shadow=true`.
4. Run it and inspect **Discover papers**. Require every batch to report zero
   `Source warning` lines. A shadow run never writes private state or opens Gate 1;
   repeat the same window until all sources are complete.

From the terminal:

```bash
gh workflow run ingest.yml \
  --repo Kuanhao-Chao/DeepGeno.watch-state \
  --ref main \
  -f mode=manual \
  -f from=2026-09-01 \
  -f through=2026-09-02 \
  -f backfill_days=0 \
  -f batch_days=1 \
  -f shadow=true
gh run list \
  --repo Kuanhao-Chao/DeepGeno.watch-state \
  --workflow ingest.yml \
  --event workflow_dispatch \
  --limit 3
gh run watch RUN_ID \
  --repo Kuanhao-Chao/DeepGeno.watch-state \
  --exit-status
gh run view RUN_ID \
  --repo Kuanhao-Chao/DeepGeno.watch-state \
  --log
```

### 3. Promote the exact clean window

Repeat step 2 with `shadow=false`. Manual mode is fail-closed: any source issue
prevents promotion and Gate 1 creation. A clean run commits checkpoints/candidates to
private `main` and opens one private Gate 1 pull request for each non-empty daily
batch.

### 4. Review and merge Gate 1

In GitHub:

1. Open private **Pull requests** and choose an open PR labeled
   `literature-inbox`.
2. Read each title, relevance reason, complete abstract, and source link.
3. Edit the PR body. For every Candidate, check exactly one of **Summarize**,
   **Defer 7 days**, or **Dismiss**. During activation select **Summarize** for at most
   one Candidate total across every Gate 1 PR in the catch-up window—not one per daily
   batch.
4. Do not edit or remove the hidden DeepGeno markers.
5. Wait for **Literature review validation** to pass.
6. Inspect the PR diff, then merge it while signed in as the configured curator.

From the terminal:

```bash
gh pr list \
  --repo Kuanhao-Chao/DeepGeno.watch-state \
  --state open \
  --label literature-inbox
gh pr view GATE_1_NUMBER \
  --repo Kuanhao-Chao/DeepGeno.watch-state \
  --json body \
  --jq .body > /tmp/deepgeno-gate-1.md
${EDITOR:-vi} /tmp/deepgeno-gate-1.md
gh pr edit GATE_1_NUMBER \
  --repo Kuanhao-Chao/DeepGeno.watch-state \
  --body-file /tmp/deepgeno-gate-1.md
gh pr checks GATE_1_NUMBER \
  --repo Kuanhao-Chao/DeepGeno.watch-state \
  --watch
gh pr merge GATE_1_NUMBER \
  --repo Kuanhao-Chao/DeepGeno.watch-state \
  --merge \
  --delete-branch
```

Merging Gate 1 records all decisions. Each **Summarize** decision dispatches exactly one
Workers AI synthesis serially and opens a private Gate 2 pull request.

### 5. Review and merge Gate 2

In GitHub:

1. Open the private PR labeled `summary-review`.
2. Verify the hook, core problem, novelty, architecture, takeaways, evidence references,
   evidence depth, provider, and model.
3. Edit the body and check exactly one of **Approve and publish**, **Request revision**,
   or **Dismiss**.
4. For approval, also choose exactly one Priority and one Reading progress value.
5. For revision, replace the placeholder inside the revision-note markers with concrete
   technical feedback.
6. Wait for validation, confirm Preview Access has passed, inspect the diff, and merge
   as the curator.

The terminal flow is the same as Gate 1, substituting label `summary-review`, a
`/tmp/deepgeno-gate-2.md` body file, and the Gate 2 PR number.

An approval seals the declassified Markdown privately and opens or reconciles one
public delivery PR. A revision produces a new immutable draft and new Gate 2 PR.

### 6. Verify and publish the public delivery

```bash
gh pr list \
  --repo Kuanhao-Chao/DeepGeno.watch \
  --state open
gh pr diff PUBLIC_PR_NUMBER \
  --repo Kuanhao-Chao/DeepGeno.watch \
  --name-only
gh pr checks PUBLIC_PR_NUMBER \
  --repo Kuanhao-Chao/DeepGeno.watch \
  --watch
```

Require exactly one regular `content/public/papers/<slug>.md` change and green
`CI / verify`. A human then merges the public PR. Wait for the matching
`Workers Builds: deepgeno-watch` success and verify:

```bash
curl -I https://deepgeno-watch.khchao.workers.dev/
curl -L --silent --show-error \
  https://deepgeno-watch.khchao.workers.dev/catalog.json \
  | jq '{paper_count:(.papers | length)}'
```

Only after the catalog grows from zero to one:

```bash
gh variable set DEEPGENO_LIVE_INGESTION_ENABLED \
  --repo Kuanhao-Chao/DeepGeno.watch-state \
  --body true
```

Observe three scheduled cycles before raising
`DEEPGENO_MAX_SUMMARIES_PER_RUN`. Scheduled discovery is intentionally tolerant of a
partial source outage, so review every reported source warning and confirm overlap
recovery on a later run.

## Daily checks and recovery

- Compare Candidate volume with the rolling baseline and inspect discontinuities.
- Require complete abstracts, relevance reasons, unique canonical IDs, and advancing
  overlap-aware checkpoints.
- Model calls must equal newly selected papers plus explicit revisions.
- Every Draft Summary PR must show its evidence scope; every public delivery must be
  one regular Markdown file with a matching sealed digest.
- Re-run missed windows explicitly and sequentially. Never edit checkpoints, releases,
  synthesis requests, or receipts by hand to hide a failure.
- A closed unmerged Gate PR records no transition. Existing drafts and sealed releases
  are reused; ambiguous remote delivery is reconciled before another write.

### Ambiguous synthesis recovery

Do not rerun synthesis while its durable request is `armed`, `dispatching`, or
`ambiguous`. Inspect the private request, the exact Actions run, and Workers AI usage
first. The direct Workers AI endpoint is not assumed to provide idempotent replay. If a
usable completion may exist, preserve the request and do not dispatch again.

Only when the curator confirms no usable completion—or explicitly accepts duplicate
free-allocation consumption—run timestamp-guarded reconciliation from the clean public
root with its matching private clone:

```bash
npm run --silent literature -- reconcile-synthesis \
  --project-root /ABSOLUTE/PUBLIC/ROOT \
  --state-root /ABSOLUTE/PRIVATE/ROOT \
  --request SYNTHESIS_REQUEST_ID \
  --expected-updated-at EXACT_UPDATED_AT_FROM_PRIVATE_RECORD \
  --note "Provider and Actions records checked; no usable completed response exists."
```

Commit and push only the reported private synthesis-request path. Then redispatch the
original Paper explicitly:

```bash
gh workflow run summarize.yml \
  --repo Kuanhao-Chao/DeepGeno.watch-state \
  --ref main \
  -f operation=synthesize \
  -f paper_id=ORIGINAL_PAPER_ID
```

For source incidents, record the source, last success, HTTP-status category, and retry
count without copying abstracts, evidence, model output, or credentials into a public
issue.
