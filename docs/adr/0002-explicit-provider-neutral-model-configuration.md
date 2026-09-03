# Keep model providers explicit and interchangeable

Summary generation targets one shared structured contract through OpenAI, Anthropic,
and Cloudflare Workers AI adapters. Every run must name its provider and model and may
not silently fail over. The initial no-cost rollout selects the direct Workers AI REST
endpoint and `@cf/google/gemma-4-26b-a4b-it`: synthesis runs in GitHub Actions rather
than inside the public Worker, JSON Schema output keeps the boundary deterministic, and
the daily free allocation avoids a new paid model account. This adds adapter-specific
configuration, but preserves provenance and keeps a future provider switch explicit
instead of coupling Published Summaries to one response format.
