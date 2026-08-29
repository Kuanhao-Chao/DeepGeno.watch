# DeepGeno.watch safe production activation

**Spec:** User-approved plan from the 2026-08-28 collaboration session.

## Context

The public site is healthy, but the GitHub repository is public while the literature workflows persist abstracts, evidence, model records, and human-review state. The existing repository guard correctly blocks those workflows. Build a thin private companion topology without duplicating the public codebase.

## Global constraints

- `Kuanhao-Chao/DeepGeno.watch` remains public and owns source code, approved public Markdown, Astro CI, and Cloudflare deployment.
- `Kuanhao-Chao/DeepGeno.watch-state` is private and owns all private state, review PRs, workflow wrappers, secrets, and delivery receipts.
- Never bypass the private-repository guard. In CI, private-state commands require an explicit state root.
- A Gate 2 approval may create only a public pull request that changes exactly one `content/public/papers/<slug>.md` file. Never push public `main`.
- Declassification uses a positive allowlist. Public output must exclude private IDs, reviewer identity, private PR/commit metadata, provider request IDs, token usage, private digests, raw abstracts/evidence, prompts, and raw model output.
- Preserve idempotency: retries must not duplicate model calls, drafts, releases, branches, or pull requests.
- Implement behavior changes test-first and record the failing and passing commands in task reports.
- Preserve the existing production URL and Cloudflare configuration; the private companion is never connected to Cloudflare.

## Task 1: Public v2 declassification boundary

Create a strict `PublicPaperSchema` v2 and a `PublicDeclassifier` that emits a deterministic `PublicProjection` containing one Markdown path, bytes, slug, and SHA-256 digest. Retain public bibliographic fields, reviewed summary fields, taxonomy, source links/locators, evidence scope, model/provider, generation time, prompt ID/version, output schema version, and anonymous approval time. Deterministically remap evidence references to `e1`, `e2`, and omit evidence content hashes.

Update Astro content validation, paper provenance rendering, catalog/RSS consumers, fixtures, and privacy checks. The rendered site must contain no private provenance fields. Add focused failing tests before production changes, then run contract, lifecycle/publication, web build, and privacy checks.

## Task 2: Split roots and private release state

Separate the public engine/configuration root from the private Git state root. Add CLI flags `--project-root` and `--state-root`, with precedence CLI, environment, working directory. Under GitHub Actions, private-state commands must fail if `--state-root` is absent. `GitFileStateStore` becomes private-state-only and cannot write public content.

Change publication so Gate 2 approval creates an immutable private publication plus a sealed public projection/release and a delivery outbox record. Delivery states are `pending`, `pr-open`, `merged`, or `failed`. Replaying publication must reuse the sealed release. Add tests for root isolation, CI fail-closed behavior, immutable replay, and outbox transitions.

## Task 3: Idempotent public pull-request delivery

Add an injected GitHub delivery port and production adapter. The adapter creates or reuses `deepgeno/publish/<slug>`, changes exactly the projection path, opens or reuses one PR against public `main`, and includes public metadata only. Matching digests reuse the PR; differing digests conflict. Persist pending state before the external request and add reconciliation for ambiguous failures and open/merged/closed PRs.

Refactor automation and workflows so operational triggers are inactive in the public repository and usable from a private companion checkout with a pinned public engine. Add tests around one-file enforcement, direct-main refusal, idempotency, conflict detection, and timeout-after-remote-success reconciliation.

## Task 4: Companion bootstrap and operating documentation

Create a repeatable `scripts/setup-private-ops.sh` from the wizard template without modifying the template library section. Its stages must preflight `gh`, create or validate `Kuanhao-Chao/DeepGeno.watch-state` as private, seed its engine lock/workflow wrappers, configure repository variables and the `synthesis` environment, guide GitHub App creation/installation on the public repository, store the App ID/private key in `public-delivery`, validate permissions, and show safe cutover/removal steps for the old public secret.

Add companion repository templates, a split-topology ADR, and corrected status/operations/security documentation. Verify the wizard with `bash -n`, `shellcheck` when installed, and static tracing of every secret/variable name against workflow references. Do not run the interactive wizard automatically.

## Task 5: Integration, activation, and controlled scan

Run the complete local verification suite, a populated public fixture build, workflow validation, privacy scan, and Wrangler dry-run. Review the entire branch and resolve findings.

After code is safely integrated and remote actions are authorized, provision the private companion, probe the configured OpenAI model without summary generation, and run discovery with `from=2026-08-28`, `through=2026-08-28`, `batch_days=1`, `backfill_days=0`, `mode=manual`, and `shadow=false`. Require zero source issues. Summarize only `paper-1aeb281eb0343b8b`; defer the nine approved candidates for seven days; dismiss the four approved off-focus candidates. Unknown new candidates defer seven days. If the selected paper is absent, stop before synthesis.

Carry the selected paper through private Gate 1 and Gate 2, then create a one-file public PR. Human merges remain required. Verify the production catalog grows from zero to one and previews remain Access-protected. Enable daily private ingestion only after the first production publication succeeds.
