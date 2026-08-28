# Literature Curation

DeepGeno.watch turns newly discovered computational-genomics literature into a deliberately curated public reading list. Its language distinguishes scholarly identity, machine-produced evidence, and human publication authority.

## Discovery

**Paper**:
A conceptual scholarly work that may appear in several databases or publication versions.
_Avoid_: Record, article entry

**Source Record**:
A source-specific description or manifestation of a Paper, preserving that source's identity and provenance.
_Avoid_: Paper, duplicate

**Candidate**:
A normalized, relevant Paper with a complete abstract that is awaiting human triage or has been explicitly deferred.
_Avoid_: Recommendation, published paper

**Candidate Batch**:
The complete set of Candidates presented together for one triage round.
_Avoid_: Feed, digest

**Selection**:
A human decision authorizing synthesis of one Candidate; it is not approval to publish.
_Avoid_: Approval, recommendation

## Synthesis

**Evidence Packet**:
The legally accessible source material assembled for one selected Paper, divided into addressable Evidence References.
_Avoid_: Knowledge base, scraped paper

**Evidence Reference**:
A stable, located excerpt within an Evidence Packet that can support a specific summary claim.
_Avoid_: Citation, source

**Draft Summary**:
A structured, evidence-linked synthesis that has not been approved for public release.
_Avoid_: Published Summary, article

**Published Summary**:
The human-approved revision of a Draft Summary exposed in the public reading list.
_Avoid_: Draft, model output

## Curation

**Priority**:
The curator's assessment of reading value: Must-Read, Recommended, or Notable.
_Avoid_: Progress, relevance score

**Progress**:
The curator's reading state: Queued, Skimmed, or Read.
_Avoid_: Priority, publication status
