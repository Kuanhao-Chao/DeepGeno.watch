# Private workflow state

This directory is the authoritative Git-tracked state for source records, candidate
batches, human decisions, and source checkpoints. It may contain complete abstracts
and evidence packets. It must never be imported by the Astro application or included
in a Cloudflare Pages build artifact.

- `papers/`: normalized private paper and evidence records
- `batches/`: daily candidate inbox manifests
- `decisions/`: append-only human decisions
- `checkpoints/`: durable per-source cursors and overlap windows
