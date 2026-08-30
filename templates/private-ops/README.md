# DeepGeno.watch private operations

This private companion stores literature state and trusted workflow wrappers. The public engine is fetched from the exact commit recorded in `engine.lock.json`; source code, public content, Cloudflare configuration, and provider credentials are not copied here.

Provisioning creates the lock at the repository root. Do not edit generated files under `data/private/` by hand, run operational workflows in the public repository, or connect this repository to Cloudflare.

## Required repository configuration

Repository variables:

- `DEEPGENO_PUBLIC_APP_CLIENT_ID` — GitHub App client ID (a variable, never a secret)
- `DEEPGENO_PUBLIC_REPOSITORY` — exactly `Kuanhao-Chao/DeepGeno.watch`
- `DEEPGENO_CURATOR_GITHUB_LOGIN` — the only curator allowed to merge Gate 1 and Gate 2 reviews
- `DEEPGENO_MAX_SUMMARIES_PER_RUN` — optional, defaults to `20`
- `DEEPGENO_LIVE_INGESTION_ENABLED` — set to `true` only after controlled activation
- `CROSSREF_MAILTO` — optional polite-pool contact

Repository secrets:

- `DEEPGENO_PUBLIC_APP_PRIVATE_KEY` — private key for the two-repository curator App
- `OPENALEX_API_KEY` — optional source-enrichment credential

Protected `synthesis` environment variables:

- `DEEPGENO_MODEL_PROVIDER` — `openai` or `anthropic`
- `DEEPGENO_MODEL_NAME` — explicit approved model name
- `DEEPGENO_MODEL_MAX_OUTPUT_TOKENS` — optional, defaults to `5000`

Configure exactly one of these protected `synthesis` environment secrets, matching the selected provider:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

The App installation must select exactly `Kuanhao-Chao/DeepGeno.watch-state` and `Kuanhao-Chao/DeepGeno.watch`. Workflows mint a separate, single-repository token for each operation. Run the manual **Private operations preflight** after provisioning and before enabling ingestion.
