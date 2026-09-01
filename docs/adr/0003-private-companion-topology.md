# Separate private operations from the public engine

## Status

Accepted for implementation. Remote activation remains gated until this branch is
merged, locally and remotely verified, and the human provisioning steps complete.

## Context

`Kuanhao-Chao/DeepGeno.watch` is public and already deploys the static catalog through
the existing `deepgeno-watch` Cloudflare Worker. Literature discovery and synthesis,
however, persist abstracts, evidence, model responses, review identity, decisions, and
delivery receipts. Those records cannot share a public Git boundary. The earlier
single-repository workflow correctly stopped at its private-repository guard, but it
could not operate safely after the repository became public.

The public engine still needs to be reviewable, testable, and deployable without
duplicating source into a private fork. Publication must remain human-gated and must
not give automation a path to update public `main` directly.

## Decision

Use two repositories with distinct ownership:

- Public `Kuanhao-Chao/DeepGeno.watch` owns source, configuration, prompts, approved
  `content/public/papers/*.md`, CI, and Cloudflare deployment configuration.
- Private `Kuanhao-Chao/DeepGeno.watch-state` owns `data/private/**`, review pull
  requests, sealed releases, delivery outbox records, workflow wrappers, secrets, and
  delivery receipts.

The private repository stores a literal lowercase 40-hex public commit in
`engine.lock.json`. Its bootstrap action fetches that exact commit into a separate
temporary engine root and executes the public code against the explicit private state
root. The engine is never copied into the private repository.

Gate 2 approval seals the already-declassified public Markdown bytes and an immutable
digest in private release state before any network delivery. The outbox then creates
or reconciles one public pull request whose diff contains exactly one
`content/public/papers/<slug>.md` regular file. A human merges that pull request; the
delivery path never pushes public `main`.

One curator GitHub App is installed on exactly the private state and public site
repositories. Each job mints a short-lived token restricted to one repository and to
the permissions required by that job. The App private key and client ID live only in
the private companion; provider credentials live only in its protected `synthesis`
environment. Cloudflare remains connected only to the public repository.

Private-environment secrets and variables are a required capability; setup stops and
requires an eligible paid GitHub plan if they are unavailable rather than moving a
provider key into repository or public scope. The environment is restricted to `main`.
Required-reviewer protection is conditional on private-repository plan support, and
Prevent self-review remains disabled because this topology has one curator.

## Invariants

- The public repository contains no private state, operational literature workflows,
  provider secrets, App key, or durable delivery credential.
- The private repository contains no copy of the engine or public deployment config.
- CI private-state commands receive distinct explicit project and state roots.
- A release is immutable after approval; retries use its sealed bytes and digest.
- A delivery may create or reuse one branch and one pull request, but it changes only
  the sealed projection path and never updates public `main`.
- Declassification is a positive allowlist and excludes private IDs, raw evidence,
  prompts, raw model output, reviewer identity, token usage, and provider request IDs.
- App tokens are transient and one-repository-scoped. `GH_TOKEN` and
  `DEEPGENO_PUBLIC_GITHUB_TOKEN` are runtime-only values and are never stored.
- Provider keys remain in the private `synthesis` environment with no repository or
  public fallback; the environment accepts only `main` deployments.
- Public `main` requires pull requests and the stable `CI / verify` check, with no App
  bypass. The conditional Cloudflare build check is not a universal merge requirement.
- The existing Worker name, production URL, and Cloudflare configuration are
  preserved; the private companion is never connected to Cloudflare.

## Consequences

Private operations require a small companion skeleton and an explicit engine repin
when trusted public code advances. The renderer fails closed on drift and currently
targets a standard clone on one filesystem under a single trusted operator: linked
worktree `.git` files, cross-filesystem atomic moves, hardlinks, and hostile concurrent
local path swapping are outside its supported setup model.

This design adds provisioning for one repository, one protected environment, and one
GitHub App, but gives each secret and state record a private boundary while preserving
public review of the engine. Rejected alternatives are: bypassing the public-repository
guard, copying or vendoring the engine into the private repository, restoring private
state to the public repository, giving one token simultaneous two-repository scope, or
allowing automation to commit directly to public `main`.
