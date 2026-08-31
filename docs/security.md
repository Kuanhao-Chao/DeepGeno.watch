# Security and privacy boundary

Scholarly metadata, abstracts, JATS, PDFs, pull-request text, and model output are
untrusted input. The lifecycle treats them as delimited data, gives synthesis no tools,
validates strict structured output, and renders public strings through Astro escaping.

## Repository isolation

- Public `Kuanhao-Chao/DeepGeno.watch` contains source, policy, approved declassified
  Markdown, public CI, and Cloudflare configuration. It contains no operational
  literature workflow, private state, provider credential, App key, or durable delivery
  token.
- Private `Kuanhao-Chao/DeepGeno.watch-state` contains all abstracts, evidence, prompts
  sent to a model, raw model records, decisions, review identity, publications, sealed
  releases, outbox records, receipts, workflow wrappers, and secrets.
- Private workflows execute a literal public commit from `engine.lock.json` in a
  detached project root that is distinct from the explicit private state root.
- Cloudflare is connected only to the public repository. No private file, secret, or
  companion branch enters a Worker build.

## Credentials and GitHub trust

One curator GitHub App is installed on exactly the private and public repositories.
Its webhook is disabled; Metadata is read-only; Contents, Pull requests, and Issues are
read/write; every other permission is disabled. The App Client ID and private key are
stored only in the private companion. Workflows mint a new token for one repository per
job and request only that job’s permission subset.

Provider keys exist only in the private protected `synthesis` environment. Workflow
expressions expose exactly the key matching the explicit provider, and no hidden
cross-provider fallback exists. The initial environment has only `OPENAI_API_KEY`;
`ANTHROPIC_API_KEY` is an alternative, not a simultaneous fallback. Optional
`OPENALEX_API_KEY` is a private repository secret. All provider/source keys are entered
browser-to-browser and never through the setup wizard.

Private-repository environment secrets and variables require an eligible paid GitHub
plan. Setup fails closed when those controls are unavailable and never relocates a
provider key to repository or public scope. The `synthesis` environment is restricted
to `main`; its required reviewer is enabled only when the private-repository plan
supports that protection. **Prevent self-review** remains disabled because one curator
both initiates runs and owns the sole environment-approval path.

`GH_TOKEN` and `DEEPGENO_PUBLIC_GITHUB_TOKEN` are transient job values and are never
stored. The App PEM is streamed by stdin to the private repository secret and is never
printed, copied, or held in a shell variable. Any legacy public
`DEEPGENO_GITHUB_TOKEN` is removed manually only after validated cutover.

The private triage workflow deliberately uses `pull_request_target`, but its job is
secret-free, checks out literal private `main`, disables credential persistence, and
never executes a pull-request branch or interpolates event fields into shell. Synthesis
and publication run only from trusted merged private `main`. Public delivery uses a
public-only token and an exact-head compare-and-swap.

## Publication controls

- Gate 2 approval first creates an immutable private publication, sealed exact public
  bytes, a digest, and a pending delivery record.
- Declassification is a positive allowlist. It excludes private IDs, reviewer identity,
  raw abstracts/evidence and hashes, prompts, raw model output, private Git/PR metadata,
  provider request IDs, and token usage.
- Delivery may write exactly one regular
  `content/public/papers/<slug>.md` path on a dedicated branch and open or reuse one
  public pull request. It refuses direct public-main writes, extra paths, symlinks,
  executable modes, digest conflicts, and stale-head races.
- A human merges public output. Public `main` requires a pull request and `CI / verify`
  without an App bypass.

## Retrieval, build, and browser controls

- Outbound retrieval is HTTPS-only, host-allowlisted, redirect-checked, paced, and
  bounded on transient retries.
- No publisher scraping or unauthorized full-text mirroring occurs.
- A fresh production build discards Astro’s generated content cache before compiling.
- `npm run privacy` checks source and artifacts for private paths, credential patterns,
  and exact long text from private fixtures.
- CSP, framing, MIME-sniffing, referrer, permissions, and cache headers ship in
  `apps/web/public/_headers`.
- Production `workers.dev` remains public. Worker Preview URL Access is pending and
  unverified because this branch made no Cloudflare change; activation must explicitly
  enable Access for the intended reviewer policy and verify that an unauthenticated
  preview request is denied.

The companion renderer is a provisioning tool for a standard clone on one filesystem
under one trusted operator. It rejects symlinked paths and linked-worktree `.git` files.
Cross-filesystem atomic moves, hardlinks, and hostile concurrent local path swapping
are outside its supported boundary; do not run it in a shared adversarial checkout.

Never place raw provider responses, API keys, reviewer addresses, inaccessible
publisher content, or any private lifecycle identifier in `content/public`.
