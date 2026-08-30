# Task 3 implementation report

## TDD evidence

### Delivery coordinator RED

- Command: `npx vitest run packages/literature/src/delivery.test.ts`
- Result: failed before collection because the wished-for `./delivery.js` module did not exist.
- Expected cause: the GitHub delivery seam, coordinator, validation, and reconciliation behavior had not been implemented.

### Delivery coordinator GREEN

- Command: `npx vitest run packages/literature/src/delivery.test.ts`
- Result: 1 test file passed; 8 tests passed.
- Implementation: a small `deliverPublicRelease` interface coordinates deterministic branches, sealed-byte comparison, exact one-file checks, PR reuse/state reconciliation, and ambiguous-write inspection through an injected `GitHubDeliveryPort`.

### GitHub REST adapter RED

- Command: `npx vitest run packages/literature/src/github-rest.test.ts`
- Result: failed before collection because the wished-for `./github-rest.js` module did not exist.
- Expected cause: no production adapter yet implemented the tested REST headers, validators, base64 boundary, or serialized Contents writes.

### GitHub REST adapter GREEN

- Command: `npx vitest run packages/literature/src/github-rest.test.ts`
- Result: 1 test file passed; 3 tests passed.
- Implementation: the production adapter pins REST version `2026-03-10`, validates every response, scopes coordinates, decodes/encodes raw bytes only at the HTTP seam, uses deterministic all-state PR lookup, and serializes Contents writes.

### Private delivery receipt RED

- Command: `npx vitest run packages/literature/src/release.test.ts`
- Result: 5 expected failures, 9 passes.
- Expected causes: delivery records dropped remote receipts, rejected `pending → merged`, accepted unknown receipt fields, did not report changed/no-op CAS results, and rejected concurrent recording of the same remote outcome.

### Private delivery receipt GREEN

- Commands: `npx vitest run packages/literature/src/release.test.ts`; `npm run typecheck --workspace @deepgeno/literature`; focused delivery/release adapter suite.
- Result: 14 receipt/release tests passed; literature typecheck passed; 25 focused Task 3 tests passed.
- Implementation: strict allowlisted remote receipts, fixed closed-PR failure metadata, direct `pending → merged`, receipt-clearing retry state, and lock-protected idempotent CAS for identical concurrent outcomes.

### CLI delivery configuration RED

- Command: `npx vitest run packages/literature/src/cli.test.ts`
- Result: 1 expected failure, 8 passes; `resolvePublicDeliveryConfig` did not exist.
- Expected cause: the CLI had no explicit public-repository/installation-token contract for the delivery step.

### CLI delivery configuration GREEN

- Commands: `npx vitest run packages/literature/src/cli.test.ts`; `npm run typecheck --workspace @deepgeno/literature`.
- Result: 9 CLI tests passed; literature typecheck passed.
- Implementation: `deliver --slug` loads and validates the immutable publication/release/outbox, uses `DEEPGENO_PUBLIC_REPOSITORY` plus `DEEPGENO_PUBLIC_GITHUB_TOKEN`, reconciles through the REST adapter, and writes only the private receipt path.

### Split automation and safe discovery RED

- Command: `npx vitest run scripts/github/workflow-lib.test.ts`
- Result: 7 expected failures, 9 passes.
- Expected causes: split-root resolution/invocation helpers, curator guard, staged discovery transaction, and public workflow removal were not implemented.

### Split automation and safe discovery GREEN

- Command: `npx vitest run scripts/github/workflow-lib.test.ts` (with `node --check` for both automation modules).
- Result: 17 tests passed; both modules passed syntax validation.
- Implementation: Actions now require distinct explicit roots; every literature call carries literal absolute roots from the engine cwd; Git/`gh` run only in private state; discovery executes in a disposable state copy and promotes only zero-issue non-shadow results; merge recording checks the configured curator before mutation; public operational workflows are removed; publication orchestration proves pending state is pushed before GitHub delivery and the receipt is pushed afterward.

### Pre-write branch scope regression RED

- Command: `npx vitest run packages/literature/src/delivery.test.ts`
- Result: 1 expected failure, 8 passes.
- Expected cause: an existing branch containing only an unrelated file was rejected after, rather than before, the sealed target file upload (`contentWriteCount` was 1 instead of 0).

### Pre-write branch scope regression GREEN

- Command: `npx vitest run packages/literature/src/delivery.test.ts`
- Result: 9 tests passed.
- Implementation: the coordinator compares a deterministic branch to `main` before every sealed-content write; an existing branch may be empty or already contain exactly the sealed path, but any unrelated path fails before mutation. This also covers an ambiguous branch-create timeout that is reconciled by re-reading the branch.

### Existing public PR metadata RED/GREEN

- RED command: `npx vitest run packages/literature/src/delivery.test.ts`
- RED result: the new tampered-title/body retry test resolved as `pr-open`, proving the old seam reused deterministic-head PRs without checking their public text.
- GREEN command: `npx vitest run packages/literature/src/delivery.test.ts packages/literature/src/github-rest.test.ts`
- GREEN result: 14 tests passed.
- Implementation: `GitHubPullRequest` and the REST parser now retain title/body. Reconciliation requires the exact deterministic positive-allowlist title/body generated from public title, source URL, slug, and sealed path. Private IDs, reviewer state, private metadata, evidence, prompts, and digests are absent and altered existing text fails closed.

### Canonical Git SHA RED/GREEN

- RED command: `npx vitest run packages/literature/src/github-rest.test.ts` with the prior permissive `40..64` SHA validator restored temporarily.
- RED result: a 41-character SHA response was accepted.
- GREEN command: `npx vitest run packages/literature/src/delivery.test.ts packages/literature/src/github-rest.test.ts`
- GREEN result: 14 tests passed.
- Implementation: delivery branch/PR/receipt SHA validators accept exactly 40 or 64 hexadecimal characters.

### Automation import RED/GREEN

- RED command: `npx vitest run scripts/github/workflow-lib.test.ts`
- RED result: importing `automation.mjs` did not execute a command, but exposed no testable entrypoint.
- GREEN command: `npx vitest run scripts/github/workflow-lib.test.ts`
- GREEN result: 18 tests passed.
- Implementation: `main` is exported while the existing `fileURLToPath(import.meta.url)` entrypoint guard remains, so import never executes automation.

## Contract audit

| Requirement                      | Evidence                                                                                                                                                                                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Immutable exact-byte delivery    | `PrivateRelease` stores base64 bytes and SHA-256; `projectionFromRelease`, REST base64 edge, and delivery tests compare raw bytes and digest.                                                                                                            |
| One deterministic public PR/file | Branch is `deepgeno/publish/<slug>`; coordinates, compare, PR files, and merged `main` bytes all require exactly the sealed path; direct `main` is rejected.                                                                                             |
| Retry/reconciliation             | Branch-create, Contents-write, and PR-create timeout-after-success paths re-read deterministic remote state; matching bytes/PR reuse, differing bytes conflict, open/merged/closed PRs reconcile to `pr-open`/`merged`/`failed`.                         |
| Private outbox ordering/CAS      | `publish-approved` commits private publication/release/pending delivery before build or network, then commits a changed receipt after `deliver`; `transitionDelivery` is lock-protected CAS and permits legal pending/pr-open/merged/failed transitions. |
| Public PR text allowlist         | REST response parsing and reconciliation require exact deterministic title/body; only public title/source URL/slug/path are emitted.                                                                                                                     |
| Split-root companion automation  | Literature invocations include literal project/state roots; npm/build/privacy use project root, private git/gh use state root, and Actions reject missing/non-distinct roots.                                                                            |
| Safe discovery and curation      | Discovery runs in disposable private-state copy; non-shadow source issues prevent promotion/commit/Gate 1, shadow never promotes; merged Gate 1/2 events require configured curator attribution before mutation.                                         |
| Public workflows                 | `ingest.yml`, `summarize.yml`, and `triage.yml` are removed; public `ci.yml` remains.                                                                                                                                                                    |

## Final verification

- `npm test` — 14 files, 88 tests passed.
- `npm run typecheck` — web, contracts, and literature typechecks passed.
- `npm run build` — passed (expected empty-public-content warnings only).
- `npm run artifact:check` — passed (11 generated files).
- `npm run privacy` — passed (26 build files).
- `npm run deploy:dry-run` — passed with Wrangler 4.127.0.
- `git diff --check` — passed.

## Fix round 1 hardening

### Git-object read and diff-status RED/GREEN

- RED: the prior adapter used `GET /contents`, which dereferences symlinks and does not expose the tree mode; changed-file checks accepted any status.
- GREEN: `npx vitest run packages/literature/src/delivery.test.ts packages/literature/src/github-rest.test.ts` — 29 tests passed.
- The adapter now resolves ref → commit → non-recursive trees → exact blob, requires the terminal `100644` blob, and decodes that blob’s base64 bytes. Tests cover normal mode, symlink, executable, submodule, missing, malformed tree entries, and rename `previous_filename`. Delivery accepts exactly one `added` file at the sealed destination with no previous path.

### Repository/receipt and failed-reconciliation RED/GREEN

- RED: deterministic head lookup could reuse a changed repository/PR and `failed` deliveries could not reconcile an explicitly reopened or later merged recorded PR.
- GREEN: focused delivery/release tests now require public canonical repository metadata before remote mutation, fetch stored receipt PRs by exact number, and reject missing/changed heads with no writes. `failed → pr-open|merged` is now legal only through that recorded receipt and clears fixed failure metadata; `failed → pending` remains an explicit store transition that automation never invokes.

### Root binding, early delivery, and title RED/GREEN

- RED: automation trusted event privacy/root strings; CLI constructed source configuration before delivery; long public titles were rejected.
- GREEN: focused workflow/CLI tests use a real temporary Git checkout to reject nested, wrong-origin, missing-origin, and symlink roots, while accepting the exact event checkout. CLI `deliver` reads private release state before config loading; a Unicode title is deterministically limited to 256 code points only in the GitHub title and is retained in the public body.

### Fix round 1 verification

- `npm test` — 14 files, 106 tests passed.
- `npm run typecheck`, `npm run build`, `npm run artifact:check`, `npm run privacy`, `npm run deploy:dry-run`, and `git diff --check` — passed.

## Fix round 2 hardening

### Receipt, destination, and Git-object identity RED/GREEN

- RED: a schema-valid alternate receipt could replace a failed delivery’s recorded PR/head during recovery; private automation trusted a single fetch URL and `gh` defaults; Git commit reads did not prove the returned object was the requested SHA.
- GREEN: direct domain and `GitFileStateStore` tests reject alternate failed receipts while same-receipt reopen/merge clears failure; real temporary Git checkout tests reject push URLs, duplicate URLs, case drift, nested/symlink roots, and wrong/missing origins; every private `gh` call uses `--repo`; state and review pushes recheck the effective destination. REST commit reads require `.sha` equal to the requested SHA, including missing/mismatched fixtures.

### SHA-pinned delivery and trusted CI RED/GREEN

- RED: a branch could move after a comparison performed by mutable branch name.
- GREEN: all post-ref blob/compare reads are pinned to observed commit SHA. Reconciliation re-fetches and compares PR metadata, then requires the open branch still equal to the snapshot head. A deterministic fake race moves the branch after PR-file inspection and fails before a `pr-open` outcome.
- A public delivery CI guard is executed from a checkout pinned to the immutable PR base SHA. For `deepgeno/publish/<slug>`, it permits exactly one added `content/public/papers/<slug>.md`; rename, modify, delete, mismatch, and extra paths fail. The stable `verify` job remains, with no `pull_request_target` or secret-bearing PR execution.

### Fix round 2 verification

- Focused: `npx vitest run packages/literature/src/delivery.test.ts packages/literature/src/github-rest.test.ts packages/literature/src/release.test.ts scripts/github/workflow-lib.test.ts scripts/github/verify-public-delivery.test.ts` — 77 tests passed.
- Full: `npm test` — 15 files, 120 tests passed; `npm run typecheck`, `npm run build`, `npm run artifact:check`, `npm run privacy`, and `npm run deploy:dry-run` passed.
- Initial `npm run format:check` exposed pre-existing formatting drift in planning files and `packages/literature/src/cli.ts`; those files were formatted before the final formatting recheck.
- Final after-format verification: `npm test` — 15 files, 121 tests passed; `npm run typecheck`, `npm run build`, `npm run artifact:check`, `npm run privacy`, `npm run deploy:dry-run`, `npm run format:check`, and `git diff --check` all passed.

## Fix round 3 hardening

### Trusted guard RED/GREEN

- RED: the guard interpolated PR values directly in its shell command and a delivery-prefix branch outside the exact grammar returned without a CLI failure.
- GREEN: PR-derived values are step environment values and the shell command references only quoted environment variables. The validator requires the exact delivery branch grammar, `main`, immutable base/head SHAs, and base/head repository names equal to `github.repository`. NUL-safe diff and tree parsing require exactly one `A` path, absent base entry, and one `100644 blob` head entry. Subprocess tests cover a Git-valid shell-looking branch, nested branch, regular file, executable, symlink, and gitlink.

### Atomic remote content write RED/GREEN

- RED: the adapter used the mutable branch-name Contents API write without a parent SHA condition.
- GREEN: the port requires `expectedHeadSha`; the adapter serializes Git-object writes as exact parent commit read, base64 blob POST, base-tree POST with one `100644` blob entry, single-parent commit POST, and non-force ref PATCH. A fake race moves the branch immediately before write and leaves the raced tip/injected file untouched with zero sealed writes. Existing ambiguous-success reconciliation remains covered.

### Fix round 3 focused verification

- `npx vitest run scripts/github/verify-public-delivery.test.ts packages/literature/src/delivery.test.ts packages/literature/src/github-rest.test.ts packages/literature/src/release.test.ts scripts/github/workflow-lib.test.ts` — 92 tests passed.
- `npm run typecheck` — passed.
- Final matrix: `npm test` — 15 files, 135 tests passed; typecheck, build, artifact check, privacy, deploy dry-run, format check, and diff check passed.
