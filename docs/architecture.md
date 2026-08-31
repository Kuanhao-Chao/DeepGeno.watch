# Architecture

## Chosen shape

DeepGeno.watch separates a public, immutable-by-pin engine from private operational
state. The TypeScript lifecycle remains one deep module behind source, model, state,
and delivery ports; repository placement enforces which data may be public.

```text
bioRxiv · arXiv · Crossref · Europe PMC · OpenAlex
                         │
                         ▼
private Kuanhao-Chao/DeepGeno.watch-state
  workflow wrappers ── engine.lock.json (literal public commit)
        │                         │
        │              detached public engine checkout
        └────────────── project-root + explicit private state-root
                         │
            Candidate → Gate 1 → Evidence/Draft → Gate 2
                         │
                  sealed public bytes
                  + delivery outbox
                         │
                         ▼
one-file PR to public Kuanhao-Chao/DeepGeno.watch
                         │
                    human merge
                         │
                Astro → deepgeno-watch Worker
```

Cloudflare reads only the public repository. The private companion is an operational
control plane, not a deployment source and not a second copy of the application.

## Repository and root boundaries

The public project root owns:

- lifecycle/source/model code, contracts, prompts, and policy configuration;
- the companion renderer and allowlisted workflow templates;
- approved `content/public/papers/*.md` projections;
- public `CI / verify`, Astro, and `wrangler.jsonc`.

The private state root owns:

- normalized papers, candidate batches, decisions, evidence, drafts, and checkpoints;
- immutable publications, sealed releases, delivery outbox states, and receipts;
- Gate 1/Gate 2 pull requests and trusted workflow wrappers;
- the curator App identity/key and protected model/source credentials.

In GitHub Actions, private-state commands require both an explicit pinned project root
and an explicit private state root. The roots must be distinct, and the state store is
private-bound: it cannot write public content. `engine.lock.json` contains exactly the
fixed public repository and a literal lowercase 40-hex commit. Bootstrap verifies that
commit is on public `main`, checks it out detached outside private state, and runs only
that pinned code.

## Lifecycle and publication invariants

- A Candidate has a complete non-empty abstract and source provenance, plus both a
  configured topic match and an explicit computational/modeling signal.
- Canonical identity prefers normalized DOI, then accession, then a stable content
  fingerprint; repeated source records upsert rather than duplicate.
- No model runs before a Gate 1 `summarize` decision.
- Every quantitative summary claim cites validated evidence; unavailable details stay
  unavailable and inference is never promoted to a reported fact.
- Drafts, evidence packets, decisions, publications, releases, and delivery records are
  immutable or concurrency-safe, revision-aware, and replayable.
- Gate 2 approval declassifies through a positive allowlist, remaps public evidence IDs,
  and seals exact Markdown bytes plus a SHA-256 digest before delivery.
- Public output excludes private IDs, raw abstracts/evidence, evidence hashes, prompts,
  raw model output, reviewer identity, private Git metadata, provider request IDs, and
  token usage.
- Delivery persists `pending` before network work and reconciles `pr-open`, `merged`, or
  `failed` outcomes. Matching digests reuse remote state; differing bytes conflict.
- A public delivery branch and PR may change exactly one regular
  `content/public/papers/<slug>.md` file. Automation never pushes public `main`.

## Authentication and deployment

One curator GitHub App is installed on exactly `DeepGeno.watch-state` and
`DeepGeno.watch`. Its durable client ID and private key exist only in the private
companion. Each job requests a short-lived token for one repository: private state
mutation receives only its private permissions; public delivery receives only Contents
and Pull requests write. Runtime `GH_TOKEN` and `DEEPGENO_PUBLIC_GITHUB_TOKEN` values
are never persisted.

Provider credentials remain environment-scoped in the private companion, which
requires an eligible paid GitHub plan for private-repository environment secrets and
variables. There is no repository-level or public-secret fallback. `synthesis` accepts
only `main`; required-reviewer protection is used when the plan supports it, while
Prevent self-review stays disabled so the single curator retains a viable approval
path.

Public `main` requires a pull request and `CI / verify`, without an App bypass. The
existing `deepgeno-watch` Worker watches only the public repository and deploys human-
merged public content. Preview Access and deployment acceptance remain Cloudflare
controls, but the conditional Cloudflare check is not a universal branch-rule context.

## Source and evidence strategy

Discovery uses metadata interfaces rather than publisher scraping:

- bioRxiv date windows with overlap and upsert;
- arXiv OAI-PMH category sets for `q-bio.*`, `cs.LG`, and `stat.ML`;
- Crossref journal/ISSN cursor polling through created-date windows;
- Europe PMC journal discovery, DOI/PMID enrichment, and open-access JATS;
- OpenAlex singleton DOI enrichment, not bulk discovery.

Copyrighted PDFs and figures are not mirrored or republished. Full text is retained
privately only when a source exposes it legally; otherwise synthesis is marked
abstract-only.

## Failure model

A malformed record or unavailable enrichment endpoint is quarantined and reported
without erasing successful records. Non-shadow discovery with any source issue stops
before state mutation or Gate 1; shadow runs may report partial coverage without
mutation. Outbound clients pace hosts and bound transient/429 retries. Provider errors
never trigger hidden failover. Invalid synthesis stays private and retryable. Storage
corruption, root ambiguity, divergent sealed bytes, and delivery scope conflicts fail
closed because partial gate transitions are unsafe.

The companion renderer itself assumes a standard clone on one filesystem and one
trusted operator. It rejects linked-worktree `.git` files and symlinks; cross-filesystem
atomic moves, hardlinks, and hostile concurrent local path swapping are outside its
supported setup boundary.
