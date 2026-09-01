# Implementation status

Last updated: 2026-08-31

Current remote state (2026-08-31): production is served from the public
Kuanhao-Chao/DeepGeno.watch repository through existing deepgeno-watch Worker, catalog
empty. Private companion, curator App, synthesis environment, private preflight, and
public-main ruleset not yet provisioned. Branch work not remotely active until
merged/validated.

## Production baseline

- Public repository `main` remains at production commit
  `96655fe7077d0e76064e4d2d4b412d8aaacdadc3` while this work is isolated on
  `codex/safe-production-activation`.
- `https://deepgeno-watch.khchao.workers.dev` serves the static site and a valid empty
  `/catalog.json` (`schemaVersion: 1.0`, zero papers).
- The existing `deepgeno-watch` Worker, URL, asset-only `wrangler.jsonc`, build commands,
  build variables, preview configuration, and Git connection remain intact. Preview
  URL Access is pending and unverified; no Cloudflare mutation or live Access-policy
  evidence was produced by this branch.
- The remote `Kuanhao-Chao/DeepGeno.watch-state` repository does not yet exist. No App,
  secret, environment, ruleset, live operation, or production data was created from
  this implementation branch.
- Public scheduled ingestion run `33430925647` (created 2026-08-31) failed safely at
  **Confirm private repository boundary** and skipped discovery, demonstrating that no
  private state was written publicly.
- The production commit's `verify` and `Workers Builds: deepgeno-watch` checks remain
  successful. The newest CI failure is isolated to Dependabot PR #4, which proposes
  TypeScript 7/Vitest 4 and is not this activation branch. Public rulesets and legacy
  branch protection are both still absent and remain activation work.

## Implemented on this branch

- Strict public schema v2 and deterministic declassification into one validated
  Markdown projection with anonymous review time and remapped public evidence IDs.
- Positive exclusion of private identifiers, raw evidence/abstracts, reviewer identity,
  prompts/model output, provider request IDs, token use, and private Git provenance.
- Explicit public project and private state roots, with GitHub Actions requiring the
  `--state-root` CLI flag and private-bound state writers.
- Immutable private publication records, sealed exact public bytes/digests, and a
  concurrency-safe delivery outbox with `pending`, `pr-open`, `merged`, and `failed`
  states.
- Idempotent one-file public pull-request delivery with exact-head GraphQL CAS,
  reconciliation after ambiguous failures, remote identity/mode validation, direct-main
  refusal, and trusted public CI scope enforcement.
- An allowlisted private companion template with four workflow/action wrappers. Each
  operation checks out trusted private `main`, bootstraps a literal public engine pin,
  uses explicit roots, and mints one-repository GitHub App tokens.
- A fail-closed companion renderer that preserves private runtime state, detects static
  and lock drift, supports confirmed lock-only repins, and rejects symlink/special-path
  ambiguity.
- An eight-stage `scripts/setup-private-ops.sh` with a canonical wizard library,
  pre-mutation `gh` capability checks, exact repository validation, confirmed seed and
  App boundaries, browser-only provider keys, PEM stdin streaming, and a scoped
  preflight run. It is statically tested and is not run automatically.
- Durable paid-call requests that push `prepared` and one-use `armed` states before
  dispatch, mark uncertain outcomes `ambiguous`, require explicit timestamp-guarded
  reconciliation, and pass a stable OpenAI idempotency key.
- A protected non-generative model-access probe and a private controlled-scan compiler
  that validates the approved 1/9/4 decision counts, defers unknown candidates, and
  stops if the selected paper is absent without publishing the private decision list.
- One canonical public-paper schema shared by contracts and Astro, with YAML date
  adaptation isolated at the content-loader boundary and consistent Evidence Reference
  terminology.
- Updated architecture, operations, security, Cloudflare, and companion documentation,
  plus ADR 0003 for the two-repository topology.

## Verified during branch development

- Focused contract, lifecycle, publication, delivery, workflow, renderer, and wizard
  tests pass after test-first failure demonstrations.
- The full TypeScript/Vitest suite, Astro/type checks, production build, static artifact
  validation, privacy scan, YAML and embedded-shell parsing, Wrangler dry run, format,
  and diff hygiene are rerun at each completed phase.
- Independent scoped review found and closed workflow trust, immutable replay, receipt
  binding, Git endpoint, exact-CAS, renderer drift, setup-node, and token-permission
  defects before this status was recorded.

## Activation remaining

1. Complete the whole-branch verification and independent review, then merge through a
   normal public pull request with `CI / verify` green.
2. Upgrade the local GitHub CLI from 0.11.0 and run
   `./scripts/setup-private-ops.sh` from a clean public-main standard clone. The wizard
   provisions only after explicit confirmations.
3. Confirm the private companion, eligible private-environment secret/variable support,
   `main`-restricted synthesis environment, exact two-repository App installation, and
   private preflight. Keep
   `DEEPGENO_LIVE_INGESTION_ENABLED=false`.
4. Add the public pull-request-only ruleset requiring `CI / verify`, with no App bypass.
   Do not require the conditional Cloudflare check universally.
5. Commit the approved decision manifest only to the private companion, probe the
   selected model without summary generation, run the approved fixed-date discovery,
   and require zero source issues. Compile the Gate 1 body with the strict 1/9/4 plan;
   if the selected paper is absent, stop.
6. Carry only the approved paper through private Gate 1. Before Gate 2 can create the
   first public delivery PR, explicitly enable Cloudflare Access for Worker Preview URLs
   and verify the intended reviewer can enter while an unauthenticated request is denied.
7. Approve Gate 2, create the one-file public PR, and wait for human merge. Verify
   production catalog growth from zero to one. Enable scheduled private ingestion only
   after that publication succeeds.

## Known provisioning limits

The renderer supports a standard clone on one filesystem and a single trusted local
operator. Linked-worktree `.git` files are rejected. Cross-filesystem atomic moves,
hardlinks, and hostile concurrent path replacement are not supported. These limits do
not weaken the repository/runtime boundary, but operators must use the documented
canonical sibling clone rather than a shared or adversarial filesystem.

Weekly email digests, author/repository tracking, semantic search, citation/version
alerts, and curator analytics remain post-activation extensions.
