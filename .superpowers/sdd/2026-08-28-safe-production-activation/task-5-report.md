# Task 5 report: activation safety closure and local verification

## Scope and outcome

This phase closes the remaining implementation and review gaps before integration. It
does not create the private companion, change GitHub settings, call a generative model,
run live discovery, edit Cloudflare, push this branch, merge a pull request, or deploy
production.

The branch now has a reproducible private controlled-scan handoff, a non-generative
model-access probe, durable paid-call idempotency, one canonical public-paper schema,
canonical domain terminology, and an explicit Preview Access gate before the first
public delivery. The remaining work is human-gated integration and remote activation.

## Review findings closed

The whole-branch review identified three Important specification gaps:

1. A runner/provider timeout could cause an automatic retry to repeat a paid model
   call.
2. There was no safe way to validate the configured model/key without generation.
3. The approved 1/9/4 controlled-scan decisions were not reproducibly bound to the
   generated Gate 1 body.

Standards review also identified duplicated public schema logic and inconsistent
Evidence Reference / Draft Summary / Published Summary terminology. The earlier setup
review required Preview URL Access to be enabled and verified before the first
preview-producing delivery rather than asserted without evidence. All are addressed in
this phase.

## Implementation

### Durable synthesis requests

- Added a stable request ID derived from the immutable draft target and private request
  records with `prepared`, `armed`, `dispatching`, `ambiguous`, and `completed` states.
- Preparation persists immutable model identity, prompt identity/hash, Evidence Packet,
  revision feedback, and target revisions without calling the provider.
- Arming creates a 32-byte one-use token, persists only its SHA-256 digest, and is
  concurrency-locked so exactly one arming transition can win.
- Private automation pushes prepared state, pushes armed state, and only then dispatches
  the paid call. It pushes completion or ambiguity before advancing to Gate 2.
- The stable request ID is passed through the model port as the OpenAI SDK idempotency
  key. A wrong/lost token, model/prompt drift, duplicate arm, or automatic retry fails
  before generation.
- Provider uncertainty becomes `ambiguous`. Reuse is blocked until a curator inspects
  provider history and records an explicit note using a compare-and-swap
  `expectedUpdatedAt`. Completed requests materialize/reopen Gate 2 without generation.
- Abnormal synthesis subprocess failures redact the one-use token from both rendered
  command arguments and captured child output before emitting Actions diagnostics.

### Model access probe

- Added the protected workflow-dispatch operation `probe-model`, which is the manual
  workflow default.
- It checks the exact configured OpenAI model with one fixed HTTPS model-metadata GET,
  a 15-second timeout, redirects disabled, no request body, no model adapter call, no
  GitHub App token, and no state mutation.
- HTTP failures expose only status, not provider response bodies. A mismatched model
  object or non-OpenAI provider fails closed.

### Controlled scan compiler

- Added `scripts/github/prepare-controlled-scan.mjs`, a generic public engine tool that
  accepts only private-checkout paths and an exact private-repository origin.
- The private manifest is strict JSON with exactly one summarize, nine defer, and four
  dismiss decisions. Unknown candidates become seven-day deferrals.
- The compiler validates canonical candidate markers and bounded checkbox regions,
  rejects duplicate/malformed inputs and symlinks/escapes, stops without output when the
  selected paper is absent, and creates/reuses only byte-identical output.
- Real non-selected decision IDs remain outside the public repository. The runbook gives
  exact probe, discovery, compilation, PR-body validation, and recovery commands.

### Schema, language, and gate order

- Removed the duplicate 200-line Astro schema. `PublicPaperSchema` now owns all public
  fields and cross-reference rules; a small Astro adapter only normalizes YAML dates
  into canonical ISO strings and hydrates validated dates for the UI.
- Renamed public/private publication fields to `evidence.references` and aligned UI and
  docs with Evidence Reference, Draft Summary, and Published Summary.
- Added `@deepgeno/contracts` as an explicit web workspace dependency.
- Updated the setup checklist and Cloudflare/security/operations docs so Preview URL
  Access must be enabled and both authorized entry and unauthenticated denial verified
  before Gate 2 can create the first public delivery PR.

## Verification evidence

Focused verification covers durable state ordering, wrong and one-use tokens,
concurrent arming, model drift before arming, ambiguous timeout/retry blocking, stale
reconciliation, stable idempotency keys, completed replay, model-probe immutability,
workflow sequencing, strict controlled-scan counts, selected-paper absence, replay, and
symlink rejection.

The populated-fixture check temporarily added one valid schema-v2 paper, built the
site, verified exactly one catalog entry and the expected detail route/Evidence
Reference rendering, passed artifact/privacy checks, and then removed the fixture.

Final commands:

```text
npm run check
npm run format:check
git diff --check
bash -n scripts/setup-private-ops.sh
node --check scripts/github/automation.mjs
node --check scripts/github/workflow-lib.mjs
node --check scripts/github/prepare-controlled-scan.mjs
```

Recorded final matrix (2026-08-31 PT):

```text
Astro check: 0 errors, 0 warnings, 0 hints
Contracts/literature TypeScript: passed
Vitest: 20 files, 205 tests passed
Empty-catalog production build: passed
Populated schema-v2 fixture build: passed separately, fixture removed
Static artifact check: passed
Privacy check: passed
Wrangler 4.127.0 dry-run: passed with no bindings and no deployment
Prettier and Git whitespace checks: passed
Shell/Node syntax checks: passed
```

`shellcheck` is not installed on this host and was not fetched. The Bash parser and the
wizard/template static contract tests remain green.

## Read-only remote baseline refresh (2026-08-31 PT)

- Public `main` is still
  `96655fe7077d0e76064e4d2d4b412d8aaacdadc3`; its `verify` and
  `Workers Builds: deepgeno-watch` checks are successful.
- Production returns HTTP 200 with the expected security headers and `/catalog.json`
  remains schema `1.0` with zero papers.
- `Kuanhao-Chao/DeepGeno.watch-state` still returns GitHub 404.
- Public rulesets and legacy branch protection are both absent.
- Scheduled public run `33430925647` failed at **Confirm private repository boundary**
  and skipped discovery, so it wrote no private literature state publicly.
- The newest public CI failure belongs to Dependabot PR #4, which proposes TypeScript 7
  and Vitest 4; it is unrelated to this branch.

## Remaining human-gated work

1. Integrate this branch through a normal public pull request and require green public
   CI. Do not provision from the implementation worktree.
2. Upgrade the local GitHub CLI, then run `scripts/setup-private-ops.sh` from clean
   public `main`; authorize each browser/setup gate.
3. Confirm private environment-plan support, App scope, private preflight, public branch
   protection, and disabled live ingestion.
4. Commit the approved activation manifest only to the private companion, run the
   non-generative probe, and execute the fixed-date controlled discovery.
5. Compile/merge Gate 1 only if the selected paper is present. Verify Preview URL Access
   before Gate 2, then carry the one approved paper through the human-gated one-file
   public PR.
6. Verify the production catalog grows from zero to one before enabling daily private
   ingestion.
