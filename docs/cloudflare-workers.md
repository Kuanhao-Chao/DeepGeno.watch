# Cloudflare Workers deployment

The Astro application is fully static and deploys through the existing public
`deepgeno-watch` Worker as Workers Static Assets. It has no Worker entrypoint, runtime
secret, database, or private-state binding.

## Fixed repository boundary

Cloudflare Connect to Git must remain connected only to the public
`Kuanhao-Chao/DeepGeno.watch` repository. Never connect the private
`Kuanhao-Chao/DeepGeno.watch-state` companion, add its deploy key, mirror its branches,
or copy `data/private/**` into a build context. Literature operations publish through a
one-file public pull request; only a human-merged public `main` commit reaches
Cloudflare.

Preserve the existing Worker name, production URL
`https://deepgeno-watch.khchao.workers.dev`, Git connection, build history, and
configuration. The private-topology change does not require a new Worker or Pages
project.

## Existing deployment contract

The first Connect to Git attempt failed because the repository still declared the
Pages-only `pages_build_output_dir` field while Workers Builds invoked
`npx wrangler deploy`. The checked-in `wrangler.jsonc` now declares the existing
`deepgeno-watch` Worker, current compatibility date, `workers_dev`, preview URLs, and
the Astro `apps/web/dist` static-assets directory with HTML and custom-404 handling.
Do not restore the Pages field or add a `main` entrypoint.

The intended Workers Builds settings are:

- Repository: public `Kuanhao-Chao/DeepGeno.watch`
- Production branch: `main`
- Root directory: repository root, not `apps/web`
- Build command: `npm run build`
- Production deploy command: `npx wrangler deploy`
- Preview deploy command: `npx wrangler versions upload`
- Build variables: `NODE_VERSION=22.18.0` and
  `PUBLIC_SITE_URL=https://deepgeno-watch.khchao.workers.dev`
- Build-watch includes: `apps/web/*`, `content/public/*`, `packages/contracts/*`,
  `scripts/reset-web-content-cache.mjs`, `scripts/static-artifact-check.mjs`,
  `package.json`, `package-lock.json`, `.nvmrc`, `tsconfig.base.json`, and
  `wrangler.jsonc`

There is no private-path exclusion to maintain in the public checkout because private
state and operational workflow wrappers live only in the companion. Documentation or
engine-only changes may legitimately miss the build-watch include list.

Keep non-production public branch previews enabled. Preview URL Access is currently
pending and unverified because this branch made no Cloudflare mutation and captured no
live Access-policy evidence. During activation, explicitly enable Cloudflare Access for
the intended reviewer policy, then verify an authorized reviewer can enter and an
unauthenticated preview request is denied. Production `workers.dev` remains public.
`scripts/setup-private-ops.sh` does not alter Cloudflare; inspect dashboard settings
separately and do not use the obsolete activation wizard.

## Merge and deploy path

1. Before the first Gate 2 approval can produce a public preview, enable Preview URL
   Access and verify authorized entry plus unauthenticated denial.
2. Private Gate 2 approval seals exact public Markdown bytes and a digest.
3. The private outbox opens or reconciles one public PR changing exactly one
   `content/public/papers/<slug>.md` file.
4. Public CI enforces that one-file boundary and runs the full `CI / verify` job.
5. A human merges the PR to public `main`.
6. Workers Builds checks out that public merge, builds Astro, and deploys the existing
   Worker.

The public branch ruleset requires `CI / verify`. Do not require the Cloudflare check
as a universal merge context because build-watch paths may skip it for changes that do
not affect the site. For every publication PR, treat a successful post-merge Worker
deployment and production smoke test as an explicit acceptance gate.

## Local verification

Before a public merge, run:

```bash
npm ci
npm run check
git diff --check
```

`npm run check` performs typechecking, tests, a fresh production build, static-artifact
validation, privacy scanning, and `wrangler deploy --dry-run`. The dry run must
enumerate the generated assets and exit without performing a deployment.

After a Git build succeeds:

- Confirm its repository is `Kuanhao-Chao/DeepGeno.watch` and source is the expected
  public-main commit, never the companion.
- Confirm `/`, `/papers/`, `/reading-list/`, `/methodology/`, `/feed.xml`,
  `/catalog.json`, `/robots.txt`, and `/sitemap-index.xml` return successfully.
- Confirm an unknown path returns the generated custom page with HTTP 404.
- Confirm canonical, RSS, sitemap, and robots URLs use the production URL.
- Confirm headers from `apps/web/public/_headers`, including immutable hashed-asset
  caching.
- Confirm a public code/content branch gets an Access-protected preview and a path-
  excluded change may omit the conditional Cloudflare check without blocking CI.

## Failure guide

| Symptom                                          | Boundary or cause                                       | Recovery                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Application detection runs at the workspace root | Old Pages config or wrong root                          | Require `assets.directory` in the public commit and use the repository root                  |
| Workers command is used in a Pages project       | `pages_build_output_dir` was restored                   | Remove the field and verify `npx wrangler deploy --dry-run`                                  |
| Build succeeds but production returns 1042/404   | No version promoted or `workers.dev` disabled           | Inspect the existing Worker deployment and production route                                  |
| No Cloudflare check appears                      | Build-watch path skipped or Git/branch access issue     | Decide whether the path should build; otherwise review the public Git connection and `main`  |
| Build references `DeepGeno.watch-state`          | Repository boundary violation                           | Stop; disconnect the companion and restore the public-only Git connection                    |
| Node/npm/workspaces are missing                  | Wrong root or build image                               | Use the public repository root and `NODE_VERSION=22.18.0`, then clear the build cache        |
| Canonical URLs use another host                  | Missing/stale `PUBLIC_SITE_URL`                         | Restore the production build variable and rebuild                                            |
| Builds API returns an authorization error        | API token lacks the relevant Workers Builds permissions | Use the dashboard or an appropriately scoped user token; never reuse a literature/App secret |

For unresolved failures, capture the build ID, public commit SHA, failing command, and
roughly 30 surrounding log lines. Redact authorization headers, keys, private paper
text, evidence, and model records.
