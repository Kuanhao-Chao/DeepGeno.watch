# Security and privacy boundary

Scholarly metadata, abstracts, JATS, and PDFs are untrusted input. They may contain text
that resembles instructions. The lifecycle passes them to models only as delimited
evidence data, never enables tools during synthesis, validates strict structured output,
and renders strings through Astro's escaping rather than raw HTML or generated MDX.

## Required controls

- Outbound retrieval is limited to configured HTTPS hosts and rejects redirects to an
  unapproved host.
- Model API keys exist only in the trusted GitHub `synthesis` environment.
- Provider and model are explicit variables. Workflow expressions expose only the key
  for the selected provider to a synthesis job, and only that adapter is constructed.
- Pull-request workflows never execute code from candidate or summary branches with
  secrets. The synthesis workflow checks out the merged default branch.
- `pull_request_target` is intentionally absent.
- Production builds discard Astro's generated content store first, so deleting a
  public projection cannot leave a stale paper route in a reused build cache.
- Cloudflare Worker Preview URLs are protected with Access; production `workers.dev`
  remains public.
- The public build has no imports from `data/private`; `npm run privacy` scans artifacts
  for private paths, secret patterns, and exact long text from private records.
- Content Security Policy, framing, MIME-sniffing, referrer, and permissions headers are
  shipped in `apps/web/public/_headers`.

Never place raw provider responses, API keys, reviewer email addresses, or inaccessible
publisher content in `content/public`.

The optional `DEEPGENO_GITHUB_TOKEN` is used only to create/reopen review pull requests
without GitHub's approval-required bot workflow state. It should be a fine-grained,
repository-scoped credential with no access beyond contents, issues, and pull requests.
When it is absent, automation uses the ephemeral `GITHUB_TOKEN`.
