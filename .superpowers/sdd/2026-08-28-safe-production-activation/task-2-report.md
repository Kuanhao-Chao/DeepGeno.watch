# Task 2 report: Split roots and private release state

## Implementation

- Split CLI roots into `--project-root` and `--state-root`. Each takes
  precedence over its environment variable, then legacy local `--root`, then
  the working directory. In GitHub Actions, every private-state command
  requires the literal `--state-root` flag; `DEEPGENO_STATE_ROOT` is only a
  local fallback.
- Kept configuration reads at the project root and moved all lifecycle state to
  `GitFileStateStore`'s private `data/private` tree. The store no longer has a
  public-paper writer, and `project` no longer writes a checkout.
- Gate 2 now persists an immutable private publication, a sealed base64 release
  carrying the exact `PublicProjection.bytes` and digest, and a pending
  delivery record. Reports expose those three private paths plus the public
  digest; they do not expose a public-write path.
- Replays load the existing release rather than invoking the declassifier.
  Release and delivery loads validate schema, slug/path linkage, byte digest,
  release ID, and delivery/release linkage. Delivery transitions have explicit
  legal edges and an atomic store update API for Task 3.
- Updated the existing GitHub automation calls to pass explicit project and
  state roots, so the CI fail-closed rule does not break private workflows.

## Inherited partial RED

The first implementer preserved the CLI root change and initial tests, but did
not create the release module. The controller observed:

```text
npm test -- packages/literature/src/cli.test.ts packages/literature/src/release.test.ts
CLI: 6/6 passing
release.test.ts: Cannot find module './release.js'
```

## RED / GREEN / refactor evidence

### RED

```text
npm test -- --run packages/literature/src/release.test.ts
```

Initially failed because `./release.js` did not exist.

```text
npm test -- --run packages/literature/src/lifecycle.test.ts
```

After replacing the old public-write expectations, it failed because publish
still reported `publicPath` and wrote `content/public/papers/...` rather than
private publication, release, and delivery paths.

```text
npm test -- --run packages/literature/src/release.test.ts
```

Additional focused RED cycles confirmed that text decoding corrupted non-UTF-8
sealed bytes, same-state reconciliation was rejected, the store lacked an
atomic delivery transition method, and a projection path unrelated to its slug
was accepted.

### GREEN

```text
npm test -- --run packages/literature/src/release.test.ts packages/literature/src/lifecycle.test.ts packages/literature/src/cli.test.ts
```

Result: 3 files passed, 19 tests passed.

```text
npm run typecheck && npm test && npm run build && npm run artifact:check && npm run privacy && npm run deploy:dry-run && git diff --check
```

Result: workspace typecheck passed; Vitest passed 12 files / 58 tests; Astro
build completed; static artifact check passed; privacy check passed for 26
build files; Wrangler dry-run passed; and `git diff --check` passed. The build
reported only the expected empty-public-papers collection messages.

### Refactor

```text
npx prettier --write packages/literature/src/cli.ts packages/literature/src/cli.test.ts packages/literature/src/index.ts packages/literature/src/lifecycle.ts packages/literature/src/lifecycle.test.ts packages/literature/src/release.ts packages/literature/src/release.test.ts packages/literature/src/store.ts packages/literature/src/util.ts scripts/github/automation.mjs docs/plans/2026-08-28-safe-production-activation.md
```

The targeted formatter pass completed. Repository-wide `npm run format:check`
still reports pre-existing formatting differences in unrelated tracked SDD
brief/ledger files; Task 2 source files were formatted directly.

## Tests added or changed

- `cli.test.ts`: root precedence, legacy local aliasing, CI fail-closed state
  roots, and project/state isolation.
- `release.test.ts`: exact byte sealing, digest rejection, binary-byte
  preservation, slug/path validation, legal/illegal and same-state delivery
  transitions, transition persistence, and forged delivery/release rejection.
- `lifecycle.test.ts`: private-only publication report and files, immutable
  release storage, sealed public content, replay reuse, and absence of a
  public checkout write.

## Task 3 interface

- `PrivateRelease` contains immutable `projection` bytes (base64), digest,
  public path, and private-publication linkage.
- `Delivery` uses `pending | pr-open | merged | failed`.
- `GitFileStateStore.transitionDelivery(release, expectedState, nextState,
updatedAt)` uses an expected-state CAS and an exclusive filesystem lock,
  validating the delivery's link to its sealed release.
- Task 3 must use `projectionFromRelease(release)`, never re-render a public
  projection, before attempting GitHub delivery.

## Constraints confirmed

- No lifecycle or store method writes `content/public/papers`.
- The private state root is required explicitly in GitHub Actions.
- Sealed release bytes are hashed as raw `Uint8Array` data, not decoded text.
- Direct public delivery remains Task 3; Task 2 creates only private pending
  outbox state.

## Fix round 1

### RED

`npm test -- --run packages/literature/src/cli.test.ts` failed because Actions
accepted `DEEPGENO_STATE_ROOT` without the required `--state-root` flag.
Additional focused release/lifecycle cases exposed stale delivery transitions,
cross-process-safe transition serialization, partial release recovery, and
publication/release integrity gaps.

### Fix

- Actions now requires the literal `--state-root` flag; environment fallback is
  local-only.
- Store implementation helpers are private and writes are constrained to
  `data/private`; lifecycle uses canonical publication/release/delivery path
  getters.
- Release save/load validates raw sealed bytes and immutable publication
  linkage. Recovery reconstructs and compares the approved publication before
  it can seal a missing release.
- Delivery transitions now use expected-state CAS plus an exclusive per-release
  filesystem lock, reloading state under the lock. Temporary writes use a UUID.
- Private publish automation accepts only private changed paths.

### GREEN

`npm test -- --run packages/literature/src/cli.test.ts packages/literature/src/release.test.ts packages/literature/src/lifecycle.test.ts`
passed with 21 tests, followed by full repository verification before commit.

## Fix round 3: recovery and boundary proof

Added deterministic one-shot persistence faults to the approved lifecycle test:
publication-only recovery fills the release, release-only recovery fills only
the delivery, and the resulting completed replay is a no-op with one private
artifact of each kind. The same test now validates a schema-valid tampered
publication against the persisted release. Added a test-only runtime cast that
confirms the private raw writer rejects `content/public` targets.

Focused GREEN command:

```text
npm test -- --run packages/literature/src/lifecycle.test.ts packages/literature/src/release.test.ts
```

Result: 2 files passed, 15 tests passed.

## Fix round 4: immutable-draft and CLI isolation proof

Added a later approved draft for the already published paper after a mutable
title refresh; publication fails with `publication_draft_mismatch` and retains
the original sealed release. Added an offline `main(apply-triage)` integration
test with distinct roots; the decision is written under only the state root.

RED: the first empty-batch attempt was rejected by the real decision schema;
the final test seeds one deterministic candidate and selects it through the
rendered review form.
