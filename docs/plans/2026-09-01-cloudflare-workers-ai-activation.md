# Free Cloudflare synthesis and September 1 production activation

**Spec:** User-approved plan from the 2026-09-01 collaboration session.

## Constraints

- Keep the public repository and deployed static Worker free of private literature
  state and model credentials.
- Use the protected private `synthesis` environment for the Cloudflare account ID and
  Workers AI token. Do not place those values in the public repository or Worker.
- Keep provider and model selection explicit. Never silently fall back to another
  model or provider.
- Use `@cf/google/gemma-4-26b-a4b-it` for the initial free-allocation rollout, with a
  5,000-token output ceiling and one summary per run.
- Preserve durable synthesis state. Do not automatically retry a call after dispatch;
  ambiguous outcomes require operator reconciliation.
- The first live September 1 scan is strict: any source issue prevents state promotion
  or Gate 1 creation. Scheduled daily discovery may promote partial results so overlap
  recovery can catch transient misses on later runs.
- Cloudflare remains connected only to public `main`; human review and merges remain
  required at both private gates and the public delivery pull request.

## Implementation

1. Add `cloudflare-workers-ai` to the shared model-provider contract and implement a
   structured-model adapter for the direct model-specific Workers AI REST endpoint.
   Send Draft-07 JSON Schema, disable tools, streaming, and storage, use deterministic
   sampling, enforce a 120-second deadline, make one attempt, normalize supported
   Cloudflare response shapes, validate the result, and sanitize provider failures.
2. Extend CLI and workflow model configuration with `CLOUDFLARE_ACCOUNT_ID` and the
   protected `CLOUDFLARE_AI_API_TOKEN`. Add a small structured-output access probe
   that uses no paper evidence and performs no state write.
3. Add `requireCompleteSources` to staged discovery. Manual/replay activation remains
   fail-closed by default; scheduled discovery explicitly permits partial-source
   promotion and reports the issue count.
4. Add renderer `--sync-static`, which atomically replaces only the eight allowlisted
   generated companion files and optionally repins the engine while preserving every
   private runtime byte. Keep drift fail-closed without that flag.
5. Migrate the private workflow templates, repeatable setup wizard, configuration
   example, security/privacy controls, operations guide, status, Cloudflare guide, and
   provider ADR to the free Workers AI rollout.
6. Run focused red/green tests, typechecking, the complete test/build/privacy suite,
   Wrangler dry-run, diff checks, and a final requirements review.

## Activation

After the implementation is merged and deployed, sync and repin the private companion,
configure the protected environment in GitHub, run private preflight and the model
probe, then run a strict shadow catch-up from `2026-09-01` through the activation date
(currently `2026-09-02`) in one-day batches. Repeat that exact window until every batch
reports zero source issues, run it live, review and merge Gate 1, approve at most one
synthesis, review and merge Gate 2, verify the one-file public delivery preview, merge
it, and confirm the production catalog grows from zero to one before enabling scheduled
live ingestion.
