# Task 4B report: private setup wizard and operating contract

## Scope

This phase implements the repeatable private-companion setup wizard, replaces the stale
single-repository activation guidance, records the split-topology decision, and aligns
all operating/security/Cloudflare documentation with the implemented workflows. It did
not execute the wizard, create or configure a repository, capture a real credential,
dispatch a workflow, merge a branch, push a commit, or mutate GitHub/Cloudflare.

Initial Phase 4B commit before the report-only metadata amend:
`65469ae0d56c8fbead16d275fb5824146eedd134` (final amended SHA is recorded in the
handoff).

## Implementation

- Replaced obsolete `scripts/activate-production.sh` with executable
  `scripts/setup-private-ops.sh`. Its library prefix is byte-identical to the canonical
  wizard template through the unique `# STAGES:` marker: 7,206 bytes, SHA-256
  `36ddf7aa3a7da152768664bddc48451a6a738f44840eb94e1c5cb014c531c02d`.
- Added eight human-gated stages: actual modern-`gh` subcommand/auth preflight; exact
  private-repository creation/validation; literal public-main pin plus canonical sibling
  render/seed/repin; repository and protected-environment variables; exact
  least-privilege curator App guidance; Client ID and PEM stdin persistence; distinct
  current-private-main preflight dispatch/watch; and a non-mutating cutover checklist.
- The wizard validates both public fetch identity and private fetch/push identity,
  refuses a dirty committed checkout, allows renderer-validated recovery of an
  uncommitted initial skeleton, adds only nine explicit seed paths, uses non-force
  pushes, separately confirms lock-only repins, and proves a post-push same-pin no-op.
- Every GitHub secret, variable, workflow, and run operation names the fixed private
  repository explicitly. Provider and optional OpenAlex keys are browser-only. The App
  PEM is a canonical nonsymlink regular file streamed only by stdin and never copied,
  printed, persisted in a variable, or deleted by the script. Runtime `GH_TOKEN` and
  `DEEPGENO_PUBLIC_GITHUB_TOKEN` are never stored.
- The initial protected `synthesis` environment is verified to contain exactly
  `OPENAI_API_KEY`; Anthropic remains a mutually exclusive future provider option. The
  preflight run must be distinct from the prior run and attached to the exact current
  private-main SHA before it is watched to a green conclusion.
- Private-environment capability is human-confirmed before the first environment write.
  If private-repository environment secrets/variables are unavailable, setup stops with
  eligible-plan upgrade guidance and no repository/public credential fallback.
  `synthesis` is restricted to `main`; the curator reviewer is conditional on private-
  repository plan support; Prevent self-review remains disabled so the sole curator
  cannot deadlock the approval path.
- Added `scripts/setup-private-ops.test.ts`, which statically traces the committed
  artifact without executing it. It validates prefix identity, mode/syntax/stage count,
  pre-mutation capabilities and confirmations, repository/origin/root/seed/repin
  boundaries, workflow-derived variable/secret destinations, explicit `--repo` scope,
  App ceiling, PEM/provider handling, forbidden persistence/config/destructive forms,
  and preflight/cutover behavior.
- Added ADR 0003 and rewrote the public README plus architecture, operations, security,
  status, Cloudflare, and companion README documents around the fixed two-repository
  topology. Cloudflare remains connected only to public `DeepGeno.watch`; the existing
  Worker, production URL, configuration, and human-merged delivery path are preserved.
- Recorded the renderer support boundary consistently: standard clone, same filesystem,
  one trusted operator; linked-worktree `.git` files, hardlinks, cross-filesystem atomic
  moves, and hostile concurrent local path swapping are unsupported.

## File inventory

- `.superpowers/sdd/2026-08-28-safe-production-activation/progress.md`
- `.superpowers/sdd/2026-08-28-safe-production-activation/task-4b-report.md`
- `README.md`
- `docs/adr/0003-private-companion-topology.md`
- `docs/architecture.md`
- `docs/cloudflare-workers.md`
- `docs/operations.md`
- `docs/security.md`
- `docs/status.md`
- `scripts/activate-production.sh` (deleted)
- `scripts/setup-private-ops.sh`
- `scripts/setup-private-ops.test.ts`
- `templates/private-ops/README.md`

## RED evidence

The setup contract was created before the new wizard path existed:

```text
npm test -- scripts/setup-private-ops.test.ts

Test Files  1 failed (1)
Tests       8 failed (8)
Expected cause: scripts/setup-private-ops.sh was absent (ENOENT).
```

After the first green implementation, hardening assertions were added before their
changes:

```text
npm test -- scripts/setup-private-ops.test.ts

Test Files  1 failed (1)
Tests       3 failed | 6 passed (9)
Expected causes: missing gh secret-list capability check, canonical public-origin
validation/post-repin no-op, and explicit App-boundary confirmation.
```

Additional focused red/green cycles proved that Git author validation precedes local
render mutation, an uncommitted initial skeleton remains recoverable, the private push
URL cannot redirect a seed/repin, and the initial environment secret set is exactly
`OPENAI_API_KEY`. Each assertion failed for its missing boundary before the minimal
script correction. The related existing template suite also caught a documentation
contract regression (`exactly one of` the provider secrets), which was corrected before
the final focused run.

The final capability correction was also test-first:

```text
npm test -- scripts/setup-private-ops.test.ts

Test Files  1 failed (1)
Tests       1 failed | 9 passed (10)
Expected cause: the capability confirmation was absent (`capabilityGate` was -1).
```

The minimal wizard/docs correction added the required fail-closed gate, upgrade/no-
fallback guidance, `main` restriction, plan-conditional reviewer, and disabled Prevent
self-review instruction. The same focused file then passed 10/10.

## GREEN evidence

Focused wizard/template/renderer contract:

```text
npm test -- scripts/setup-private-ops.test.ts \
  scripts/github/private-ops-template.test.ts \
  scripts/github/render-private-ops.test.ts

Test Files  3 passed (3)
Tests       36 passed (36)
```

Wizard scaffold and syntax:

```text
bash -n scripts/setup-private-ops.sh
node --input-type=module -e '<prefix length/hash check>'

markerCount: 1
prefixLength: 7206
sha256: 36ddf7aa3a7da152768664bddc48451a6a738f44840eb94e1c5cb014c531c02d
```

## Full verification

```text
npm run check
npm run format:check
git diff --check
test ! -e scripts/activate-production.sh
bash -n scripts/setup-private-ops.sh
node --input-type=module -e '<parse YAML and bash -n every run block>'
```

```text
Astro check: 0 errors, 0 warnings, 0 hints
Contracts/literature TypeScript: passed
Vitest: 18 files, 182 tests passed
Astro static build: passed (expected empty-paper collection notices)
Static artifact check: 11 files passed
Privacy check: 26 build files passed
Wrangler 4.127.0 dry-run: passed with no bindings and no deployment
Prettier check: passed
Git whitespace check: passed
Configuration syntax: all 15 YAML files and 27 embedded Bash run blocks passed
Obsolete activation wizard: absent
```

`shellcheck` is not installed on this host, so its optional check was reported and
skipped. No alternative shell linter was installed or fetched.

## Security/static trace results

- Repository workflow variables: `DEEPGENO_PUBLIC_APP_CLIENT_ID`,
  `DEEPGENO_PUBLIC_REPOSITORY`, `DEEPGENO_CURATOR_GITHUB_LOGIN`,
  `DEEPGENO_MAX_SUMMARIES_PER_RUN`, `DEEPGENO_LIVE_INGESTION_ENABLED`, optional
  `CROSSREF_MAILTO`.
- Protected environment variables: `DEEPGENO_MODEL_PROVIDER`,
  `DEEPGENO_MODEL_NAME`, `DEEPGENO_MODEL_MAX_OUTPUT_TOKENS`.
- Repository secrets: `DEEPGENO_PUBLIC_APP_PRIVATE_KEY`, optional
  `OPENALEX_API_KEY` (browser-only).
- Protected environment secret: initially exactly `OPENAI_API_KEY` (browser-only), with
  `ANTHROPIC_API_KEY` only as an explicit mutually exclusive alternative.
- Private-environment support is confirmed by the human before configuration. Missing
  support stops with eligible-plan upgrade guidance; provider keys never fall back to
  repository/public scope. `synthesis` accepts only `main`, its reviewer is enabled only
  when supported, and Prevent self-review remains disabled for the single curator.
- No helper below `# STAGES:` writes an environment file or ambient repository; no
  authentication/config mutation, broad Git add, force push, reset/clean, repository
  deletion, executable secret deletion, provider-key terminal capture, or credential
  export exists.

## Caveats and handoff

- The script was intentionally not run. Its first supported execution is after this
  code reaches clean public `main`, the system GitHub CLI is upgraded from 0.11.0, and
  the human authorizes each provisioning gate.
- The current account plan was not inferred or changed. The operator must confirm that
  private environment secrets and variables are available; otherwise the wizard stops
  and requires an eligible paid-plan upgrade.
- No remote state is active from this branch. The companion, App, environment,
  preflight, ruleset, model probe, controlled scan, review merges, and first publication
  remain Task 5.
- Cloudflare verification in this phase was local/dry-run only. The existing public
  Worker and URL were not changed.
- A failed network push after a successful local seed/repin commit remains visible and
  must be resolved without force before rerunning; the wizard never resets or cleans an
  operator checkout.

## Scoped review fix round 1 (2026-08-31)

Independent review of `faeda0c..de1103a` found three Important setup-boundary gaps:

1. The wizard inspected only one companion fetch URL and one effective push URL, so an
   additional configured URL was not ruled out.
2. It did not validate the fixed public repository's visibility, fork/archive state,
   and default branch before the first possible repository mutation.
3. Security/status prose asserted that Preview URL Access was active without a
   Cloudflare mutation or live policy evidence.

The same review recorded two Minor recovery/usability gaps: an exact nine-file staged
initial seed could not resume after interruption, and cloning an empty private
companion could reach an interactive HTTPS credential prompt without an earlier access
check. The fix round is recorded as
`de1103aac1499ecca7b8ccc1e05fd4f30c92239b..FIX_COMMIT_PENDING`; the resulting commit
SHA is reported in the handoff because a commit cannot contain its own identity.

### Fix-round RED evidence

The first focused run added behavioral/model tests before changing the wizard:

```text
npm test -- scripts/setup-private-ops.test.ts

Test Files  1 failed (1)
Tests       4 failed | 9 passed (13)
Expected causes: no pre-mutation public metadata validator; no all-fetch/all-push URL
enumeration; no private HTTPS access probe; and no exact staged-seed recovery helper.
```

After the initial implementation, a separate test-first correction required the access
probe to be non-interactive:

```text
npm test -- scripts/setup-private-ops.test.ts

Test Files  1 failed (1)
Tests       1 failed | 12 passed (13)
Expected cause: the probe lacked GIT_TERMINAL_PROMPT=0.
```

### Fix-round implementation and GREEN evidence

- Public repository metadata is queried and must equal the fixed full name with
  `private=false`, `fork=false`, `archived=false`, and `default_branch=main` before
  `gh repo create` can run. Behavioral Bash tests reject each unsafe tuple.
- Bash 3.2 code enumerates every public fetch URL and every companion fetch and push
  URL with `git remote get-url --all` / `--all --push`; exactly one allowed URL must
  remain. The real validator rejects empty, mismatched, and additional URL sets.
- After companion metadata validation and before clone/render, the wizard runs
  `GIT_TERMINAL_PROMPT=0 git ls-remote` without `--exit-code`, so an authenticated empty
  repository succeeds and missing HTTPS credentials stop with manual outside-wizard
  guidance rather than prompting for a token.
- Initial seed recovery accepts only all nine exact untracked entries or all nine exact
  staged additions. An integration-style temporary Git repository proves untracked and
  staged recovery while rejecting mixed and extra state; the subsequent `git add`
  remains exact-path-only.
- Architecture, Cloudflare, security, status, and activation-plan documentation now
  record Preview URL Access as pending/unverified and require activation to enable it
  and verify both an authorized reviewer and denial of an unauthenticated request.

```text
npm test -- scripts/setup-private-ops.test.ts \
  scripts/github/private-ops-template.test.ts \
  scripts/github/render-private-ops.test.ts

Test Files  3 passed (3)
Tests       39 passed (39)
```

```text
npm run check

Astro check: 0 errors, 0 warnings, 0 hints
Contracts/literature TypeScript: passed
Vitest: 18 files, 185 tests passed
Astro static build: passed (expected empty-paper collection notices)
Static artifact check: 11 files passed
Privacy check: 26 build files passed
Wrangler 4.127.0 dry-run: passed with no bindings and no deployment
```

The macOS system Bash used for the helper behavior and syntax checks is 3.2.57.
`bash -n` passed; the canonical prefix remains one marker, 7,206 bytes, SHA-256
`36ddf7aa3a7da152768664bddc48451a6a738f44840eb94e1c5cb014c531c02d`, mode 0755.
All 15 YAML files and 27 embedded Bash run blocks parsed successfully. Prettier and Git
whitespace checks passed. `shellcheck` remains unavailable, so its optional check was
reported and skipped. No wizard, remote, GitHub, Cloudflare, or production mutation
occurred. Fresh scoped re-review of this fix remains the next gate.
