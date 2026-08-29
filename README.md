# DeepGeno.watch

DeepGeno.watch is a human-gated literature discovery and publishing system for
computational genomics, biological sequence models, and sequence-to-function work.
It continuously discovers papers, prepares a private ranked inbox with complete
abstracts, synthesizes only explicitly selected papers, and publishes only summaries
that a curator merges.

```text
official scholarly sources
  → normalize · deduplicate · rank · tag
  → private candidate pull request (Gate 1)
  → evidence packet · structured LLM synthesis
  → one private summary pull request per paper (Gate 2)
  → approved Astro collection
  → Cloudflare Workers Static Assets
```

The public site is fully static. Private abstracts, evidence packets, model inputs,
and editorial decisions stay in `data/private` and are checked for build leakage.

## Workspace

- `packages/contracts` — JSON-compatible Zod contracts shared by every adapter.
- `packages/literature` — the deep lifecycle module, source/model adapters, review
  parsing, Git-file state, and CLI.
- `apps/web` — Astro 7 static catalog, reading list, feed, and machine-readable export.
- `data/private` — authoritative private candidates, evidence, decisions, and cursors.
- `content/public/papers` — human-approved public summary projection.
- `config` — sources, taxonomy, relevance policy, journal list, and model examples.
- `prompts` — versioned relevance and synthesis instructions.
- `.github/workflows` — CI, discovery, and trusted post-merge synthesis automation.

See [CONTEXT.md](./CONTEXT.md) for the domain language and
[docs/architecture.md](./docs/architecture.md) for boundaries and lifecycle rules.
The current implementation/activation checklist lives in
[docs/status.md](./docs/status.md).

## Local setup

Requirements: Node.js 22.18 or newer and npm 11.

```bash
npm install
npm run check
npm run build
npm run dev
```

No LLM provider is selected by default. To synthesize, choose exactly one provider
and model explicitly:

```bash
export DEEPGENO_MODEL_PROVIDER=openai
export DEEPGENO_MODEL_NAME=your-explicit-openai-model-id
export DEEPGENO_MODEL_MAX_OUTPUT_TOKENS=5000
export OPENAI_API_KEY=...
```

or:

```bash
export DEEPGENO_MODEL_PROVIDER=anthropic
export DEEPGENO_MODEL_NAME=your-explicit-model-id
export DEEPGENO_MODEL_MAX_OUTPUT_TOKENS=5000
export ANTHROPIC_API_KEY=...
```

There is no automatic cross-provider failover: a provider failure remains visible and
retryable, which makes provenance and spending auditable.

## Editorial workflow

1. The daily workflow retrieves overlapping source windows, upserts normalized source
   records, and opens a dated candidate PR. A candidate is reviewable only when its
   full abstract is present.
2. In the PR body, choose exactly one of **Summarize**, **Defer**, or **Dismiss** for
   every paper. Merging records those decisions.
3. The trusted merged-PR workflow builds the best legally available evidence packet,
   invokes the configured structured-output model once, validates the result, and
   opens one summary PR per selected paper.
4. In the summary PR, choose Approve, Request revision, or Dismiss. Approval also
   records one reading priority and one progress state. A revision requires written
   feedback and creates a new immutable draft/PR from the same evidence packet.
5. Only an approved summary is projected publicly. The workflow builds and privacy
   checks the static site before committing that projection to `main`.

Source updates and replay are safe: canonical identifiers, revisioned candidates, and
input digests make discovery and synthesis retries idempotent. Requested summary
changes create a new immutable draft revision rather than mutating prior provenance.

## Deployment

Connect the private GitHub repository to the existing Cloudflare Worker
`deepgeno-watch` through Workers Builds with:

- Production branch: `main`
- Root directory: repository root
- Build command: `npm run build`
- Production deploy command: `npx wrangler deploy`
- Preview deploy command: `npx wrangler versions upload`
- Node version: `22.18.0`
- Build-time `PUBLIC_SITE_URL`: `https://deepgeno-watch.khchao.workers.dev`
- Build watch includes: `apps/web/*`, `content/public/*`, `packages/contracts/*`,
  `scripts/reset-web-content-cache.mjs`, `scripts/static-artifact-check.mjs`,
  `package.json`, `package-lock.json`, `.nvmrc`, `tsconfig.base.json`, and
  `wrangler.jsonc`
- Build watch excludes: `data/private/*`

Literature review branches touch only excluded private paths, so Workers Builds should
skip them. Enable non-production branch builds for web/code previews and protect
Preview URLs with Cloudflare Access. The checked-in `wrangler.jsonc` is the deployment
contract for the asset-only Worker. Full setup, smoke tests, and failure recovery are in
[docs/cloudflare-workers.md](./docs/cloudflare-workers.md).

## Operating budget

The default policy expects 10–30 daily candidates but makes zero synthesis calls before
Gate 1. One canonical summary powers every public depth. The $15/month value in the
reference model config is a planning target, not a billing guarantee; configure a
provider-side spend alert as the hard monthly control. The workflow also caps selected
summaries per run.
The default limits are 20 new summaries per Gate 1 merge and 5,000 output tokens per
model call; both are explicit GitHub variables.
