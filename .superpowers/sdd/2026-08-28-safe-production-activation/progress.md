# SDD ledger — plan: docs/plans/2026-08-28-safe-production-activation.md

## Preflight interface scan

| Producer task | Consumer task | Shared interface/files                                 | Finding                                                                                                                         |
| ------------- | ------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Task 1        | Task 2        | `PublicProjection`, public schema, renderer            | Clean: Task 2 must persist the already-declassified projection, never reconstruct a public document from an unvalidated object. |
| Task 2        | Task 3        | sealed release and delivery outbox                     | Clean: Task 3 owns remote transitions; Task 2 owns immutable local records.                                                     |
| Task 3        | Task 4        | companion workflow inputs, secret/variable names       | Clean: Task 4 must copy exact names from implemented workflow contracts.                                                        |
| Task 4        | Task 5        | setup wizard, engine pin, runbook                      | Clean: Task 5 may execute only validated non-interactive portions automatically; secret/App dashboard stages stay human-gated.  |
| Task 1        | Task 1        | v2 schema, evidence remapping, Astro UI, privacy tests | Internally consistent. Breaking the empty public contract is safe because the catalog has zero papers.                          |
| Task 2        | Task 2        | split roots, CI fail-closed, release/outbox replay     | Internally consistent. Local defaults may remain backward compatible, while GitHub Actions requires explicit roots.             |
| Task 3        | Task 3        | one-file PR delivery, idempotency, reconciliation      | Internally consistent. Public delivery PR constraints do not apply to this implementation branch.                               |
| Task 4        | Task 4        | wizard, templates, docs                                | Internally consistent. The wizard is committed because setup is repeatable.                                                     |
| Task 5        | Task 5        | verification, provisioning, controlled scan            | Internally consistent, with human review merges retained as explicit gates.                                                     |

Ruling: use schema version `2.0` for public frontmatter and projection interface version `1.0` — the public contract is breaking but currently has no records; the envelope is newly introduced. Cost if wrong: one pre-publication contract rename.

Ruling: persist declassified public Markdown in the private sealed release so engine upgrades cannot change approved bytes during delivery retry. Cost if wrong: safe public bytes are duplicated in private state.

Ruling: unknown candidates in the controlled live rerun default to seven-day defer, and absence of the selected paper prevents synthesis. Cost if wrong: newly surfaced papers wait one week rather than being summarized immediately.

Ruling: use `DEEPGENO_PUBLIC_APP_CLIENT_ID`, not an App ID, with `actions/create-github-app-token@v3`; current GitHub documentation explicitly distinguishes the client ID and uses it for the action input. Cost if wrong: the setup names differ from the earlier prose plan, but match the current authentication contract.

Ruling: the public ruleset will require the stable `verify` check, not the Cloudflare check. Cloudflare omits its check when build-watch paths skip a change, so requiring that conditional context would deadlock documentation-only pull requests. Cost if wrong: Cloudflare deployment remains an explicit publication acceptance check rather than a universal merge gate.

Ruling: install one curator GitHub App on exactly the private state and public site repositories, then mint repository-scoped tokens per job. App-created private Gate PRs trigger validation workflows, whereas `GITHUB_TOKEN`-created PRs do not; one App avoids a second PAT. Permissions are Metadata read plus Contents, Pull requests, and Issues read/write, with each token explicitly narrowed. Cost if wrong: the App has Issues permission on the public repository although public delivery itself does not use it.

Ruling: the production GitHub REST adapter will send `X-GitHub-Api-Version: 2026-03-10`, serialize repository-content writes, and request only Contents write plus Pull requests write on the public token. Current primary docs require base64 content and a branch for file writes, Contents read/write for refs/compare/content, and Pull requests read/write for deterministic PR lookup/creation. Cost if wrong: the version header and response validators must be advanced together when GitHub retires this version.

Task 1: review found one Important gap — public claim schemas accepted arbitrary evidence IDs; fix round 1 dispatched to the original implementer.

Task 1: fix round 1/5 (1 addressed, 0 open; commits `b085062..7b4626c`).

Task 1: complete (commits `96655fe..7b4626c`, review clean).

Task 2: first implementer stopped after hitting an account usage limit; partial test-first CLI/release work was preserved and reassigned without resetting the worktree.

Remote audit (2026-08-29 PT): public `main` remains `96655fe` with its push CI successful; production returns HTTP 200 and `/catalog.json` contains zero papers. The companion repository and public ruleset are absent. Dependabot PR #3 fails only because it proposes TypeScript 7.0.2 while Astro check requires the TypeScript programmatic API from 6.x or earlier; this unrelated bot branch is not part of the activation implementation.

Task 2: review found five Important gaps — CI accepted an environment-only state root, raw store writers were not private-bound, release/publication linkage was incomplete, publication-only partial writes were unrecoverable, and delivery transitions lacked concurrency-safe CAS/locking. Fix round 1/5 dispatched to the Task 2 implementer; two Minor automation/root-isolation test gaps are included.

Ruling: under GitHub Actions, private-state commands require the actual `--state-root` CLI flag; `DEEPGENO_STATE_ROOT` remains a local/non-Actions fallback only. Cost if wrong: workflow wrappers must always pass one explicit argument, which is already the intended companion contract.

Task 2: fix round 1/5 addressed the five original Important findings and the automation allowance, but scoped re-review found one new Important immutable-replay regression plus missing corruption/partial-state/later-draft/mutating-root proof. Fix round 2/5 dispatched (commits `3c5127b..f9f5590`).

Task 2: fix round 2/5 addressed the immutable-replay regression; scoped review passed with no Critical/Important findings (`f9f5590..24fcd14`). A final test-hardening round 3/5 was dispatched to close the remaining fault-injection, linkage, later-draft, mutating-root, and runtime private-boundary proof before Task 2 completion.

Task 2: fix round 3/5 added deterministic publication-only and release-only recovery, completed-replay, schema-valid linkage-tamper, and runtime private-writer boundary proof (`24fcd14..a1ab890`). Scoped review passed with no Critical/Important findings; later-different-draft and mutating CLI root-isolation tests remain Minor required coverage and were dispatched as round 4/5.

Task 2: fix round 4/5 added later-approved-draft conflict and mutating CLI root-isolation proof (`a1ab890..9e09e9e`). Scoped review found no Critical/Important findings and confirmed closure readiness, with one Minor fidelity gap: post-conflict assertions used an in-memory release instead of reloading all persisted artifacts. Assertion-only fix round 5/5 dispatched.

Task 2: fix round 5/5 reloaded and compared the persisted publication, release, delivery, and sealed bytes after a later-draft conflict (`9e09e9e..7faf964`). Scoped review passed with no findings.

Task 2: complete (commits `7b4626c..7faf964`, review clean).

Task 3: first implementer hit an account usage limit after preserving substantial uncommitted test-first delivery/automation work. The current focused suite has 51 passing tests and one intentional RED: existing unrelated branch content is detected only after a sealed-file write. Work was preserved without reset and reassigned to finish the pre-write scope guard, audit the full Task 3 contract, and verify/commit the phase.

Remote audit refresh (2026-08-29 PT): local/public `main` remains clean at `96655fe`; production returns the empty schema `1.0` catalog; `DeepGeno.watch-state` still returns 404. Scheduled public ingestion run `33264838748` failed specifically at “Confirm private repository boundary” and skipped discovery, confirming no private-state mutation while also demonstrating why Task 3 removes public operational triggers.

Task 3: independent review of `7faf964..a69a3df` found five Important fail-closed gaps: Contents API symlink/executable ambiguity, rename status loss in the one-file guard, unbound persisted remote receipts/repository metadata, failed-receipt reconciliation dead-end, and no proof that the state root is the event repository checkout. Three Minor replay/title/validator issues were also recorded. Fix round 1/5 dispatched to the replacement Task 3 implementer.

Task 3: fix round 1/5 (`a69a3df..627a135`) closed the original five findings and local replay/title issues, but fresh scoped review found four Important deeper gaps: failed transitions could substitute a different receipt through the domain/store API; unvalidated Git pushurl and implicit gh repository selection could redirect writes; Git commit response identity was not checked; and mutable-head sampling lacked SHA pinning plus a trusted public merge-time one-file guard. Formatting cleanup was also recorded. Fix round 2/5 dispatched.

Task 3: fix round 2/5 (`627a135..8cb530c`) closed receipt substitution, Git/gh destination binding, commit identity, and SHA-pinned reconciliation, but scoped review found three Important gaps: attacker-controlled head_ref shell interpolation plus ignored false validation; CI name/status omitted Git mode/type; and the actual Contents write remained branch-name TOCTOU despite pinned reads. Fix round 3/5 dispatched with Git-object/ref CAS and immutable regular-blob CI validation.

Task 3: fix round 3/5 (`8cb530c..e0f6eed`) closed the trusted-workflow interpolation/result, Git mode/type, and immutable-read gaps, but scoped review found one Important production-CAS mismatch: REST `PATCH /git/refs` with `force:false` enforces only fast-forward, while the fake enforced exact expected-head equality. Fix round 4/5 dispatched to replace the ref update with GraphQL `createCommitOnBranch(expectedHeadOid)` and prove stale-head rejection at the adapter boundary.

Task 3: fix round 4/5 (`e0f6eed..e868ef9`) introduced the correct GraphQL exact-head primitive, but scoped review found three Important integration/test gaps: the parser treated GraphQL `Ref.name` as qualified instead of validating separate `prefix`/`name`; custom REST-to-GraphQL URL mapping discarded the GHES `/api` prefix; and the adapter stale-head test used a canned error instead of a stateful reset/head comparison. Fix round 5/5 dispatched as the final Task 3 contract correction.

Task 3: fix round 5/5 (`e868ef9..49b1598`) validated the real GraphQL Ref prefix/name/repository/Commit shape, added same-origin GitHub.com/GHES/custom endpoint routing, and proved exact `expectedHeadOid` behavior with a stateful adapter fake covering ancestor reset and serialized same-head races. Scoped review passed with no Critical or Important findings; one Minor Task 3 report chronology label is deferred to documentation cleanup.

Task 3: complete (commits `7faf964..49b1598`, review passed with no Critical/Important findings).

Task 4A: first companion-template implementer hit an account usage limit after preserving one test-first allowlist test. The preserved focused test fails for the expected reason (`templates/private-ops` does not yet exist); the worktree was not reset and was reassigned for implementation.

Task 4A: implementation commit `df4777f` passed 165 tests and syntax checks, but independent review found three Critical workflow defects (invalid job-level `runner` context, workspace-relative `setup-node` version path, and untrusted `pull_request` workflow definition) plus five Important renderer/preflight gaps (runtime private-state reruns, interrupted-copy recovery, write-permission issuance proof, canonical repin drift, and symlinked destination ancestors). Fix round 1/5 dispatched to the Phase 4A implementer.

Task 4A: the fix-round implementer hit an account usage limit after preserving changes in exactly the expected renderer/bootstrap/workflow/test files. The preserved focused suite is green (25/25) and diff hygiene passes; work was reassigned without reset for the eight-finding audit, full matrix, and commit.

Task 4A: fix round 1/5 (`df4777f..faeda0c`) closed all three Critical and five Important findings plus a validation-order regression. Scoped review passed with no Critical/Important findings. Minor documented limitations: renderer targets a standard clone on one filesystem, does not support linked-worktree `.git` files, and assumes no hostile concurrent local path swapping.

Task 4A: complete (commits `49b1598..faeda0c`, review passed with no Critical/Important findings).

Ruling: private-repository environment secrets and variables are mandatory for provider credentials. Setup must stop with eligible-paid-plan upgrade guidance when unavailable and may never fall back to repository/public provider secrets. The `synthesis` environment is restricted to `main`; its required reviewer is conditional on private-repository plan support; Prevent self-review stays disabled because this is a single-curator topology. Cost if wrong: a lower-plan private companion cannot activate until upgraded, rather than weakening credential scope or deadlocking the sole approver.

Task 4B: final capability fix was test-first (1 expected failure, then 10/10 focused wizard tests). Wizard, split-topology ADR, and corrected operating/security/Cloudflare documentation now pass 182 tests and the full local verification matrix. No wizard, remote, or production mutation occurred. Initial commit `65469ae0d56c8fbead16d275fb5824146eedd134` precedes one report-only metadata amend (final SHA in handoff); independent scoped review pending.

Task 4B: scoped review of `faeda0c..de1103a` found three Important gaps: additional companion fetch/push URLs were not excluded; fixed public-repository metadata was not validated before the first possible mutation; and Preview URL Access was asserted active without Cloudflare evidence. Two Minor gaps covered interrupted exact-staged seed recovery and a missing pre-clone private HTTPS credential check. Fix round 1/5 was dispatched test-first.

Task 4B: fix round 1/5 (`de1103aac1499ecca7b8ccc1e05fd4f30c92239b..FIX_COMMIT_PENDING`) enumerates and binds all relevant remote URLs with Bash 3.2, validates exact public metadata before mutation, performs a non-interactive empty-repository-safe HTTPS probe, resumes only exact untracked or exact staged nine-file seeds, and marks Preview URL Access pending until explicitly enabled and verified. RED was 4 failures/9 passes, followed by a separate non-interactive-probe RED of 1 failure/12 passes. GREEN is 39/39 focused and 185/185 full tests plus the complete local verification matrix; no remote or production mutation occurred. Fresh scoped re-review pending.
