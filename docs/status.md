# Implementation status

Last updated: 2026-09-02

## Live production and control-plane status

- Public `Kuanhao-Chao/DeepGeno.watch` `main` is at
  `1389302efb58dfcb5cee317110f5301dc4859b80`. The local public checkout is clean
  and matches `origin/main`.
- `https://deepgeno-watch.khchao.workers.dev` returns HTTP 200. Its public
  `/catalog.json` is valid and contains zero papers.
- The production commit has successful `verify` and
  `Workers Builds: deepgeno-watch` checks.
- The active public ruleset **Protect public main** requires a pull request and the
  `verify` status check, blocks deletion and non-fast-forward updates, and grants no
  bypass actor.
- Private `Kuanhao-Chao/DeepGeno.watch-state` exists, is private and unarchived, and
  has a seeded `main` at `203b0e5266f57a8281f9b6983d66aed15fda1c33`. Its
  `engine.lock.json` still pins the current public production commit, and its tree
  contains only the generated wrappers, lock, and private README skeleton.
- No private GitHub Actions workflow has run. Repository variables and secrets are
  empty. The `synthesis` environment exists but has zero variables and zero secrets.
- The environment currently uses GitHub's **Protected branches only** policy. That is
  not an adequate `main`-only restriction when private branch protection is unavailable;
  activation must switch it to **Selected branches and tags** with only `main`.
- Cloudflare Preview URL Access remains unverified. Production is public; no private
  candidate, evidence, draft, or publication state exists yet.

## Current implementation branch

Work continues in the isolated worktree
`/private/tmp/deepgeno-cloudflare-workers-ai` on
`codex/cloudflare-workers-ai`, based on public commit `1389302`. The branch adds:

- a direct Cloudflare Workers AI structured-model adapter with explicit account,
  token, and model configuration; Draft-07 JSON Schema output; deterministic sampling;
  a 120-second deadline; sanitized failures; and no automatic retry;
- the initial free-allocation profile
  `cloudflare-workers-ai/@cf/google/gemma-4-26b-a4b-it`, capped at 5,000 output tokens
  and one summary per activation run;
- a small paper-free structured access probe that performs no private-state write;
- strict source completeness for manual and replay discovery, with explicit
  successful-source promotion for scheduled overlap recovery;
- an allowlisted `--sync-static` renderer path that updates generated private wrappers
  and optionally repins the public engine without changing private runtime state;
- Cloudflare-only private workflow wiring, browser-guided token/account setup, detailed
  Preview Access steps, and a privacy marker for `CLOUDFLARE_AI_API_TOKEN`.

The OpenAI and Anthropic adapters remain available in the public engine, but the
generated private workflow does not expose their credentials or silently fall back to
them.

## Verification completed at this checkpoint

- `npm run check` passed end to end: all workspace typechecks, 20 test files with 217
  tests, Astro production build, 11-file static artifact validation, 26-file privacy
  scan, and a Wrangler 4.127.0 dry run over 30 static assets with no bindings.
- `npm run format:check`, `git diff --check`, and
  `bash -n scripts/setup-private-ops.sh` passed. ShellCheck is not installed locally.
- The new privacy-marker and Workers AI chat-response tests were each observed failing
  for the intended missing behavior before their minimal fixes, then passed.
- Live read-only verification confirmed the repository, environment, ruleset, checks,
  Worker response, and zero-paper production catalog facts listed above.

The final whole-branch requirements review remains before integration.

## Activation remaining

1. Finish documentation/configuration, run the complete verification suite, and review
   the whole branch against the approved activation plan.
2. Commit and push the implementation branch, open a public pull request, require green
   `CI / verify`, merge it normally, and confirm the connected Cloudflare build deploys
   that exact public-main commit.
3. Run `./scripts/setup-private-ops.sh` from the clean updated public checkout. It will
   sync the eight wrappers, repin the companion, configure the repository/environment,
   guide the curator App setup, and run private preflight.
4. In the private `synthesis` environment, use an explicit selected-branch rule for
   `main`; add the four Workers AI variables and exactly one
   `CLOUDFLARE_AI_API_TOKEN` secret. Keep
   `DEEPGENO_LIVE_INGESTION_ENABLED=false`.
5. Enable Preview URL Access for **Previews only** and verify signed-in curator access
   plus unauthenticated denial.
6. Run the small model probe, then a strict shadow discovery covering 2026-09-01 through
   2026-09-02. Require zero source issues before repeating the same window live.
7. Triage every Gate 1 Candidate through the GitHub web UI or terminal, select at most
   one paper for synthesis, and merge as the configured curator. Review the resulting
   Gate 2 Draft Summary and approve, revise, or dismiss it.
8. For approval, verify the generated public pull request changes exactly one paper
   Markdown file, merge it after CI, confirm the production catalog grows from zero to
   one, and only then enable scheduled live ingestion.

## Known provisioning limits

Private-repository environment secrets and variables require an eligible GitHub plan.
If GitHub does not expose those controls, activation stops; credentials are never moved
to a repository-level or public secret as an implicit workaround.

The renderer supports a standard clone on one filesystem and a single trusted local
operator. Linked-worktree `.git` files are rejected. Cross-filesystem atomic moves,
hardlinks, and hostile concurrent path replacement are outside the supported setup
model.

Weekly email digests, author/repository tracking, semantic search, citation/version
alerts, and curator analytics remain post-activation extensions.
