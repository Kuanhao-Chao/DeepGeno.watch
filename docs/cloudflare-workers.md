# Cloudflare Workers deployment

The Astro application is fully static. It deploys through the existing
`deepgeno-watch` Worker as Workers Static Assets and does not need a Worker entrypoint,
assets binding, D1, KV, or runtime secrets.

## Confirmed failure and recovery

Cloudflare's first **Connect to Git** attempt created a Worker while the repository
still declared the Pages-only `pages_build_output_dir` setting. Workers Builds then ran
`npx wrangler deploy` at the npm workspace root and Wrangler stopped during application
detection. The Astro build itself remained green.

The checked-in `wrangler.jsonc` fixes that product mismatch by declaring
`assets.directory`, SSG-compatible HTML handling, the generated `404.html`, production
`workers.dev`, and version preview URLs. Do not recreate this as a Pages project and do
not add a Worker `main` entrypoint.

## Configure Workers Builds

1. In **Workers & Pages**, select the existing `deepgeno-watch` Worker.
2. Open **Settings → Build** and connect the private GitHub repository
   `Kuanhao-Chao/DeepGeno.watch` if it is not already selected.
3. Set the production branch to `main` and leave the root directory at the repository
   root. Do not use `apps/web` as the root.
4. Set the build command to `npm run build`.
5. Set the production deploy command to `npx wrangler deploy`.
6. Set the preview deploy command to `npx wrangler versions upload` and enable builds
   for non-production branches.
7. Add build variables `NODE_VERSION=22.18.0` and
   `PUBLIC_SITE_URL=https://deepgeno-watch.khchao.workers.dev` for production and
   preview builds. Neither value is a secret.
8. Set build watch includes to `apps/web/*`, `content/public/*`,
   `packages/contracts/*`, `scripts/reset-web-content-cache.mjs`,
   `scripts/static-artifact-check.mjs`, `package.json`, `package-lock.json`, `.nvmrc`,
   `tsconfig.base.json`, and `wrangler.jsonc`. Exclude `data/private/*`.
9. Under **Settings → Domains & Routes**, keep the production `workers.dev` route
   public. Enable Cloudflare Access for **Preview URLs** and restrict it to the intended
   reviewers.
10. Save the settings before retrying a build; retries use the settings that are active
    at retry time.

Private-only Gate 1 and Gate 2 review branches should be skipped by build watch paths.
Changes to the web app, public projection, build scripts, dependencies, or deployment
configuration should build and receive a GitHub check.

## Local and remote verification

Before pushing, run:

```bash
npm ci
npm run check
git diff --check
```

`npm run check` performs typechecking, tests, a fresh production build, static-artifact
validation, privacy scanning, and `wrangler deploy --dry-run`. The dry run must enumerate
the generated assets and exit without workspace-detection or Pages-project errors.

After the Git build succeeds:

- Confirm the deployment source is Git rather than `dash_template`.
- Confirm `/`, `/papers/`, `/reading-list/`, `/methodology/`, `/feed.xml`,
  `/catalog.json`, `/robots.txt`, and `/sitemap-index.xml` return successfully.
- Confirm an unknown path returns the generated custom page with HTTP 404.
- Confirm canonical, RSS, sitemap, and robots URLs use
  `https://deepgeno-watch.khchao.workers.dev`.
- Confirm CSP, referrer, framing, MIME-sniffing, permissions, and immutable asset-cache
  headers from `apps/web/public/_headers`.
- Confirm a web/code branch receives an Access-protected preview and a private-only
  literature review branch is skipped.

## Build failure guide

| Symptom                                                   | Cause                                                        | Recovery                                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Application detection ran at the workspace root           | Old Pages config or incorrect root directory                 | Confirm the build commit has `assets.directory` and reset the root to the repository root                |
| Workers command used in a Pages project                   | `pages_build_output_dir` is still present                    | Remove the field completely and rerun `npx wrangler deploy --dry-run`                                    |
| Build succeeds but the production URL returns 1042 or 404 | No version was promoted or `workers.dev` is disabled         | Inspect the production deployment and enable the production `workers.dev` route                          |
| No Cloudflare GitHub check appears                        | Git access, branch control, or watch paths skipped the build | Reauthorize the repository, confirm `main`, review watch paths, and retry                                |
| Node, npm, or workspace packages are missing              | Wrong root or build image                                    | Use the repository root, set `NODE_VERSION=22.18.0`, save settings, then clear the build cache and retry |
| Canonical URLs still use another hostname                 | Missing or stale build variable                              | Set `PUBLIC_SITE_URL`, clear the build cache, and rebuild                                                |
| Builds API returns Cloudflare code 10000                  | API token lacks Workers Builds permissions                   | Use the dashboard or a user-scoped token with Workers Builds Read/Configuration permissions              |

For an unresolved failure, capture the build ID, checked-out commit SHA, failing command,
and approximately 30 surrounding log lines from Build History. Redact tokens, API keys,
authorization headers, private abstracts, and evidence text.
