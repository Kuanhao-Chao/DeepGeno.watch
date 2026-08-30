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

| Requirement | Evidence |
|---|---|
| Immutable exact-byte delivery | `PrivateRelease` stores base64 bytes and SHA-256; `projectionFromRelease`, REST base64 edge, and delivery tests compare raw bytes and digest. |
| One deterministic public PR/file | Branch is `deepgeno/publish/<slug>`; coordinates, compare, PR files, and merged `main` bytes all require exactly the sealed path; direct `main` is rejected. |
| Retry/reconciliation | Branch-create, Contents-write, and PR-create timeout-after-success paths re-read deterministic remote state; matching bytes/PR reuse, differing bytes conflict, open/merged/closed PRs reconcile to `pr-open`/`merged`/`failed`. |
| Private outbox ordering/CAS | `publish-approved` commits private publication/release/pending delivery before build or network, then commits a changed receipt after `deliver`; `transitionDelivery` is lock-protected CAS and permits legal pending/pr-open/merged/failed transitions. |
| Public PR text allowlist | REST response parsing and reconciliation require exact deterministic title/body; only public title/source URL/slug/path are emitted. |
| Split-root companion automation | Literature invocations include literal project/state roots; npm/build/privacy use project root, private git/gh use state root, and Actions reject missing/non-distinct roots. |
| Safe discovery and curation | Discovery runs in disposable private-state copy; non-shadow source issues prevent promotion/commit/Gate 1, shadow never promotes; merged Gate 1/2 events require configured curator attribution before mutation. |
| Public workflows | `ingest.yml`, `summarize.yml`, and `triage.yml` are removed; public `ci.yml` remains. |

## Final verification

- `npm test` — 14 files, 88 tests passed.
- `npm run typecheck` — web, contracts, and literature typechecks passed.
- `npm run build` — passed (expected empty-public-content warnings only).
- `npm run artifact:check` — passed (11 generated files).
- `npm run privacy` — passed (26 build files).
- `npm run deploy:dry-run` — passed with Wrangler 4.127.0.
- `git diff --check` — passed.
