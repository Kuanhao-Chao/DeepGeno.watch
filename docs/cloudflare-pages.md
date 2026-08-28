# Cloudflare Pages setup

The web application is a static Astro build and does not require Pages Functions,
Workers bindings, D1, KV, or runtime secrets.

## Create the project

1. In **Workers & Pages**, create a Pages project named `deepgeno-watch` and connect
   the private GitHub repo. Do not create it with `wrangler pages project create`:
   that creates a Direct Upload project, and Cloudflare does not allow converting a
   Direct Upload project to Git integration later.
2. Select `main` as the production branch.
3. Use repository root `/`, build command `npm run build`, and output directory
   `apps/web/dist`.
4. Set `NODE_VERSION=22.18.0` if the build image does not honor `.nvmrc`.
5. Keep the checked-in `wrangler.jsonc` aligned with the dashboard. It records the
   Pages project name, output directory, and compatibility date without any runtime
   bindings or secrets.
6. Under **Build watch paths**, include `apps/web/*`, `content/public/*`,
   `packages/contracts/*`, `scripts/reset-web-content-cache.mjs`, `package.json`,
   `package-lock.json`, `.nvmrc`, `tsconfig.base.json`, and `wrangler.jsonc`. Exclude
   `data/private/*`. Cloudflare's `*` path pattern also matches nested directories.
7. Under **Settings → General**, enable the preview access policy as defense in depth.
   Review branches contain only private-path changes and should be skipped by build
   watch rules. Web/code branches still receive previews and should require Access.

## Smoke test

- Merge a harmless public-content change and confirm only `main` changes production.
- Open a draft summary PR and confirm Pages skips the build because only
  `data/private/*` changed.
- Open a harmless `apps/web/*` PR and confirm its preview requires Cloudflare Access.
- Confirm `/papers/`, `/reading-list/`, `/feed.xml`, and `/catalog.json` return 200.
- Run `npm run privacy` against the locally built artifact.
- Add a unique 120-character sentinel to a temporary private record, rebuild, and verify
  the privacy check still passes; deliberately copying it into public content must fail.

Pages Git integration can be delayed independently of CI. Treat the GitHub build check
and the Pages deployment check as separate release signals.
