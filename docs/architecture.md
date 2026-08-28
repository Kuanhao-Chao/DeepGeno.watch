# Architecture

## Chosen shape

DeepGeno.watch uses a TypeScript monorepo, Git-backed private workflow state, approved
Markdown as the publication source, and an Astro static projection. Network providers
sit behind narrow internal ports; the lifecycle rules remain inside one deep module.

```text
bioRxiv ─┐
arXiv ───┼─ LiteratureSource adapters ─┐
Crossref ┘                              │
Europe PMC / OpenAlex enrichment ──────┼─ LiteratureLifecycle
OpenAI / Anthropic / fake model ────────┤    ├─ private inbox projection
Git files / temporary test store ───────┘    └─ approved public projection
                                                    │
                                                    └─ Astro → Cloudflare Pages
```

The lifecycle interface is intentionally coarse. Callers may discover, apply a human
decision batch, synthesize eligible papers, and project a view; they cannot call a
ranker or publisher in a way that skips a gate. Normalization, deduplication, ranking,
state transitions, evidence validation, retry safety, and publication invariants stay
local to the module.

## Invariants

- A Candidate always has a complete, non-empty abstract and source provenance.
- A Candidate must match both a configured domain topic and an explicit computational
  or modeling signal; descriptive wet-lab keyword overlap alone is insufficient.
- Canonical identity prefers normalized DOI, then source accession, then a stable
  content fingerprint. Multiple source records merge into one Paper, and identical
  source accessions appear only once in its provenance.
- No synthesis model runs before an explicit candidate `summarize` decision.
- No summary is public before an explicit draft approval represented by a merged PR.
- Every quantitative claim names at least one evidence ID.
- Missing details remain missing; model output cannot turn inference into reported fact.
- Decisions and external work are idempotent, revision-aware, and replayable.
- A deferred Candidate resurfaces after its timer even when an upstream source does
  not repeat the old record.
- A revision request must carry curator feedback and produces a new immutable Draft
  Summary that identifies the draft it supersedes.
- Public projection cannot read `data/private`.
- Provider, model, prompt, schema, evidence scope, input digest, generation time, and
  review time remain attached to every publication.

## Storage

V1 deliberately uses reviewable Git files rather than an operational database:

- `data/private/papers`: normalized source records, candidates, evidence, drafts
- `data/private/batches`: stable daily review snapshots
- `data/private/decisions`: append-only human choices
- `data/private/checkpoints`: source cursors and overlap boundaries
- `content/public/papers`: validated, approved publication documents

The domain contracts contain no filesystem or Node-specific values. A future D1-backed
review desk can implement the internal state port without changing the public catalog
or provider adapters.

## Source strategy

Discovery uses official or community-supported metadata interfaces only:

- bioRxiv date-window API, with three-day overlap and upsert
- arXiv OAI-PMH through its canonical `oaipmh.arxiv.org` endpoint, using the `q-bio`,
  `cs:cs:LG`, and `stat:stat:ML` server-side sets and retaining a category-boundary
  check for `q-bio.*`, `cs.LG`, and `stat.ML`
- Crossref journal/ISSN polling using stable created-date windows and cursor pagination
- Europe PMC core journal search to recover complete abstracts that Crossref omits
- Europe PMC DOI/PMID enrichment and open-access JATS when available
- OpenAlex singleton DOI enrichment, not bulk discovery

The system does not scrape publisher pages, mirror copyrighted PDFs, or republish
figures. Full text is fetched only when legally exposed by the source and retained as
private evidence; otherwise synthesis is explicitly marked abstract-only.

## Failure model

One malformed source record or unavailable enrichment endpoint is quarantined and
reported without erasing successful records. The shared outbound client paces each
configured host and retries bounded transient/429 responses; Crossref uses the polite
pool and stays below its list-request budget. Provider errors never trigger a hidden
failover. Schema-invalid synthesis remains private and retryable. Storage corruption or
an inability to commit state is fatal because partial gate transitions are unsafe.

Every source applies its configured overlap before fetching. Cursor checkpoints retain
the exact effective source window, so an interrupted page sequence is completed before
the next window begins. Gate 1 fan-out is rejected before model jobs when it exceeds
the configured per-run ceiling.
