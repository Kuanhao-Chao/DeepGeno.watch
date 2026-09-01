# DeepGeno.watch private operations

This private companion stores literature state, sealed publication releases, delivery
receipts, and trusted workflow wrappers. It is not an application fork. The public
engine is fetched from the exact lowercase 40-hex commit in root `engine.lock.json`;
source code, public content, Cloudflare configuration, and provider credentials are not
copied into this repository.

Never edit generated files under `data/private/**` by hand, run operational workflows
in the public repository, copy the public engine here, or connect this repository to
Cloudflare. Public delivery is always a one-file pull request to
`Kuanhao-Chao/DeepGeno.watch`; automation never pushes public `main`.

## Setup and engine repins

Provision from a clean standard clone of public `DeepGeno.watch` after its implementation
is merged and `CI / verify` is green:

```bash
./scripts/setup-private-ops.sh
```

The wizard renders exactly the eight allowlisted template files plus
`engine.lock.json`, confirms that diff, and non-force pushes private `main`. A later
engine update is a separate confirmed `--repin` operation and may change only
`engine.lock.json`; rerunning the renderer with the same pin must be a clean no-op.

The renderer assumes a canonical sibling standard clone, one filesystem, and one
trusted operator. Linked-worktree `.git` files are unsupported. Cross-filesystem atomic
moves, hardlinks, and hostile concurrent local path swapping are outside the supported
setup boundary.

## Required repository configuration

Repository variables:

- `DEEPGENO_PUBLIC_APP_CLIENT_ID` — GitHub App Client ID, not its numeric App ID
- `DEEPGENO_PUBLIC_REPOSITORY` — exactly `Kuanhao-Chao/DeepGeno.watch`
- `DEEPGENO_CURATOR_GITHUB_LOGIN` — exactly `Kuanhao-Chao`
- `DEEPGENO_MAX_SUMMARIES_PER_RUN` — `1` during activation; normal ceiling `20`
- `DEEPGENO_LIVE_INGESTION_ENABLED` — `false` until the first publication succeeds
- `CROSSREF_MAILTO` — optional polite-pool contact

Repository secrets:

- `DEEPGENO_PUBLIC_APP_PRIVATE_KEY` — private key for the curator App
- `OPENALEX_API_KEY` — optional, entered browser-to-browser

Protected `synthesis` environment variables:

- `DEEPGENO_MODEL_PROVIDER` — initially `openai`
- `DEEPGENO_MODEL_NAME` — initially `gpt-5.6-terra`
- `DEEPGENO_MODEL_MAX_OUTPUT_TOKENS` — initially `5000`

The initial protected environment contains exactly `OPENAI_API_KEY`, entered
browser-to-browser. Configure exactly one of `OPENAI_API_KEY` or
`ANTHROPIC_API_KEY`; the latter is the mutually exclusive alternative for a future
explicit provider switch. Provider keys never enter the setup wizard.

Private-repository environment secrets and variables require an eligible paid GitHub
plan. If they are unavailable, stop and upgrade; never fall back to repository-level or
public provider secrets. Restrict `synthesis` to `main`. Add the curator as a required
reviewer only when the private-repository plan supports it, and leave **Prevent
self-review** disabled so this single-curator topology retains an approval path.

## App and preflight boundary

The curator GitHub App has webhook disabled, Metadata read, and Contents, Pull
requests, and Issues read/write, with every other permission disabled. Install it on
exactly `Kuanhao-Chao/DeepGeno.watch-state` and `Kuanhao-Chao/DeepGeno.watch`.
Workflows mint a separate short-lived, one-repository token for each operation;
`GH_TOKEN` and `DEEPGENO_PUBLIC_GITHUB_TOKEN` are never stored.

After any initial setup or confirmed repin, manually run **Private operations
preflight** on private `main`. It must fetch the literal engine pin and prove that both
production-scope tokens enumerate exactly their one expected repository before any
live ingestion is enabled.

## Activation safety

Keep live ingestion disabled and use the manual **Literature synthesis and
publication** workflow's default `probe-model` operation before the controlled scan.
The probe checks configured OpenAI model metadata without generation or state writes.
The approved controlled-scan decision manifest remains private and is compiled against
the generated Gate 1 body with the pinned engine; follow `docs/operations.md` in the
public engine for the exact command and gate order.

Paid synthesis pushes prepared and one-use armed request states before dispatch. Never
edit those records or automatically retry an armed, dispatching, or ambiguous request.
Inspect provider history and use only the documented timestamp-guarded reconciliation
procedure. Enable and verify Cloudflare Preview URL Access before approving Gate 2 for
the first public delivery.
