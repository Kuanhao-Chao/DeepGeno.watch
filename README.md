# DeepGeno.watch

DeepGeno.watch is a human-gated literature discovery and publishing system for
computational genomics, biological sequence models, and sequence-to-function work. It
discovers and ranks papers privately, synthesizes only explicit selections, and
publishes only human-approved Published Summaries.

```text
official scholarly sources
  → private DeepGeno.watch-state repository
      pinned public engine + private candidate/evidence/review state
      Gate 1 selection → structured synthesis → Gate 2 approval
      sealed declassified release + delivery outbox
  → one-file pull request to public DeepGeno.watch
  → human merge → Astro catalog → existing Cloudflare Worker
```

The repository boundary is part of the security model:

- Public `Kuanhao-Chao/DeepGeno.watch` owns source code, policies, prompts, approved
  public Markdown, CI, and Cloudflare configuration.
- Private `Kuanhao-Chao/DeepGeno.watch-state` owns abstracts, evidence, model records,
  review state, sealed releases, outbox records, workflow wrappers, and secrets.
- Cloudflare connects only to the public repository. Private operational workflows and
  `data/private/**` never live in this repository.

## Public workspace

- `packages/contracts` — strict JSON-compatible Zod contracts shared by adapters.
- `packages/literature` — lifecycle, source/model adapters, state ports, and CLI.
- `apps/web` — Astro 7 static catalog, reading list, feed, and JSON export.
- `content/public/papers` — declassified, human-approved Published Summary Markdown only.
- `config` — sources, taxonomy, relevance policy, journals, and model examples.
- `prompts` — versioned relevance and synthesis instructions.
- `templates/private-ops` — the allowlisted private companion skeleton.
- `scripts/github` — bootstrap, automation, delivery, and validation tools.
- `.github/workflows/ci.yml` — public verification; operational workflows are absent.

See [CONTEXT.md](./CONTEXT.md) for domain language,
[docs/architecture.md](./docs/architecture.md) for system boundaries, and
[docs/status.md](./docs/status.md) for the activation state.

## Local development

Requirements: Node.js 22.18 or newer and npm 11.

```bash
npm install
npm run check
npm run dev
```

No model provider is selected by default. Local synthesis requires exactly one
explicit provider, model, output ceiling, and matching credential set (including a
Cloudflare account ID for Workers AI). There is no automatic cross-provider failover,
so provenance, failures, and quota remain auditable.

## Editorial workflow

1. A private ingestion run retrieves overlapping source windows, normalizes and ranks
   complete-abstract candidates, and opens a private Gate 1 review pull request.
2. The curator chooses exactly Summarize, Defer, or Dismiss for every candidate. A
   trusted private-main workflow records a merged review.
3. Selected papers receive a legally scoped Evidence Packet and one structured model
   call. Each immutable Draft Summary receives its own private Gate 2 pull request.
4. Approve, Request revision, or Dismiss records the human decision. Revision creates a
   new immutable Draft Summary from the same evidence and explicit feedback.
5. Approval seals deterministic declassified Markdown and a delivery record privately.
   Delivery opens or reuses a public pull request changing exactly one
   `content/public/papers/<slug>.md` file.
6. A human merges the public pull request. Public CI validates the one-file boundary,
   schema, build, and privacy contract before Cloudflare deploys the merge.

Canonical identifiers, input digests, immutable revisions, sealed releases, and
reconciled outbox states make retries idempotent without duplicating branches or pull
requests. Provider-backed synthesis separately pushes prepared and one-use armed states
before dispatch; uncertain outcomes block automatic replay until explicit curator
reconciliation. OpenAI receives the stable request ID as an idempotency key when that
provider is explicitly selected; the initial Workers AI path relies on the durable
private request state and makes only one network attempt.

## Private companion setup

After this implementation is merged to public `main` and `CI / verify` is green, run
the committed, browser-guided setup from a clean standard clone:

```bash
./scripts/setup-private-ops.sh
```

Its eight confirmed stages validate a current GitHub CLI, create or validate the exact
private companion, sync the eight allowlisted wrappers and public-engine pin, configure
repository and protected-environment values, guide a least-privilege two-repository
GitHub App, persist only its client ID/key, run the private token-scope preflight, and
stop at the activation checklist. It does not dispatch live ingestion, merge review
gates, change public rules, or publish content. The verified local GitHub CLI is current;
the wizard still checks the required subcommands before making any change.

The initial synthesis configuration is `cloudflare-workers-ai` /
`@cf/google/gemma-4-26b-a4b-it`, 5,000 output tokens, and at most one summary per run.
The account ID is an environment variable; the API token is copied browser-to-browser
into the protected private `synthesis` environment and never entered into the wizard.
The one-summary activation cap is designed to stay inside Workers AI's daily free
allocation. On Workers Free, excess requests fail; on a paid account, Cloudflare's
billing configuration remains authoritative, so verify the account plan before the
probe. Private-environment secrets and variables require an eligible GitHub plan; setup
stops if those controls are unavailable and never falls back to repository or public
provider secrets. Restrict the environment with an explicit selected-branch rule for
`main`. Required reviewers are used only when supported, and **Prevent self-review**
stays disabled so the sole curator cannot deadlock the approval path. Daily mutation
remains disabled until the controlled first publication passes.

## Deployment

The existing public `deepgeno-watch` Worker deploys `Kuanhao-Chao/DeepGeno.watch`
`main` as Workers Static Assets using the checked-in `wrangler.jsonc`. Preserve its
name, URL, build/deploy commands, and build variables. Never connect
`DeepGeno.watch-state` to Cloudflare.

Public `main` is pull-request-only and requires `CI / verify`. The Cloudflare check is
conditional because build-watch paths may legitimately skip non-site changes, so it is
verified for publication merges but is not a universal required context. Full setup
and recovery instructions are in
[docs/cloudflare-workers.md](./docs/cloudflare-workers.md).

## Operating budget

Discovery is free of model calls until Gate 1. One canonical structured summary powers
every public depth. During activation the companion caps summaries at 1 per run and
Workers AI supplies 10,000 free neurons per day; a Free-plan account stops further
inference after that allocation instead of enabling paid overage. Increase the summary
ceiling only after the first publication and several observed daily cycles.
