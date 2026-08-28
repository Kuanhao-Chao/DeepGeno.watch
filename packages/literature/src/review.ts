import {
  DecisionBatchSchema,
  DraftDecisionBatchSchema,
  type Actor,
  type CandidateBatch,
  type DecisionBatch,
  type DraftDecisionBatch,
  type DraftSummary,
} from "@deepgeno/contracts";
import { LiteratureError } from "./errors.js";
import { sha256 } from "./util.js";

const CANDIDATE_MARKER =
  /<!-- deepgeno:candidate id="([a-zA-Z0-9._-]+)" revision="(\d+)" -->/g;
const REVISION_NOTE_PLACEHOLDER =
  "Describe the requested technical changes here.";

export function renderCandidateReview(batch: CandidateBatch): string {
  const sections = batch.candidates.map((candidate, index) => {
    const paper = candidate.paper;
    const authors = paper.authors.map((author) => author.name).join(", ");
    const metadata = [
      paper.publicationDate,
      paper.venue,
      paper.identifiers.find((identifier) => identifier.type === "doi")?.value,
    ]
      .filter((value): value is string => Boolean(value))
      .map(escapeHtml)
      .join(" · ");
    return [
      `## ${index + 1}. ${escapeHtml(paper.title)}`,
      `<!-- deepgeno:candidate id="${candidate.id}" revision="${candidate.revision}" -->`,
      "<!-- deepgeno:decision:start -->",
      "",
      "- [ ] Summarize",
      "- [ ] Defer 7 days",
      "- [ ] Dismiss",
      "",
      "<!-- deepgeno:decision:end -->",
      `<p><strong>${escapeHtml(authors)}</strong><br>${metadata}</p>`,
      `<p>Relevance ${Math.round(candidate.relevance.score * 100)}% · ${candidate.topics.map(escapeHtml).join(", ")}</p>`,
      "<details><summary>Complete abstract</summary>",
      `<blockquote><p>${escapeHtml(paper.abstract)}</p></blockquote>`,
      "</details>",
      `<p><a href="${escapeAttribute(paper.landingUrl)}">Source record</a></p>`,
    ].join("\n");
  });
  return [
    `# DeepGeno.watch candidate inbox — ${batch.window.through}`,
    `<!-- deepgeno:candidate-batch id="${batch.id}" revision="${batch.revision}" -->`,
    "",
    "Check exactly one decision for every paper. Editing source metadata does not change pipeline state.",
    "",
    ...sections,
    "",
  ].join("\n");
}

export function parseCandidateReview(
  body: string,
  batch: CandidateBatch,
  options: { actor: Actor; decidedAt: string; deferDays?: number },
): DecisionBatch {
  const header = body.match(
    /<!-- deepgeno:candidate-batch id="([a-zA-Z0-9._-]+)" revision="(\d+)" -->/,
  );
  if (
    !header ||
    header[1] !== batch.id ||
    Number(header[2]) !== batch.revision
  ) {
    throw new LiteratureError(
      "review_batch_mismatch",
      "Candidate review body does not match the stored batch",
    );
  }
  const blocks = markedBlocks(body, CANDIDATE_MARKER);
  if (blocks.size !== batch.candidates.length) {
    throw new LiteratureError(
      "review_marker_count",
      "Candidate review contains unknown or missing markers",
    );
  }
  const decisions = batch.candidates.map((candidate) => {
    const block = blocks.get(`${candidate.id}:${candidate.revision}`);
    if (!block)
      throw new LiteratureError(
        "review_candidate_missing",
        `Review is missing ${candidate.id}`,
      );
    const decisionRegion = extractDecisionRegion(block, candidate.id);
    const actions = [
      {
        pattern: /^\s*- \[[xX]\] Summarize\s*$/m,
        action: "summarize" as const,
      },
      { pattern: /^\s*- \[[xX]\] Defer 7 days\s*$/m, action: "defer" as const },
      { pattern: /^\s*- \[[xX]\] Dismiss\s*$/m, action: "dismiss" as const },
    ].filter(({ pattern }) => pattern.test(decisionRegion));
    if (actions.length !== 1) {
      throw new LiteratureError(
        "review_choice_count",
        `${candidate.id} must have exactly one checked decision`,
      );
    }
    const action = actions[0]!.action;
    return {
      candidateId: candidate.id,
      candidateRevision: candidate.revision,
      action,
      decidedAt: options.decidedAt,
      decidedBy: options.actor,
      ...(action === "defer"
        ? { deferUntil: addDays(options.decidedAt, options.deferDays ?? 7) }
        : {}),
    };
  });
  const id = `triage-${batch.id}-${sha256(JSON.stringify(decisions)).slice(0, 12)}`;
  return DecisionBatchSchema.parse({
    schemaVersion: "1.0",
    id,
    candidateBatchId: batch.id,
    candidateBatchRevision: batch.revision,
    recordedAt: options.decidedAt,
    decisions,
  });
}

export function renderDraftReview(
  draft: DraftSummary,
  paperTitle: string,
): string {
  const summary = draft.summary;
  const statements = [
    `### Core problem\n${escapeHtml(summary.coreProblem.statement)} (${summary.coreProblem.evidenceIds.join(", ")})`,
    `### Novelty\n${summary.novelty.map((item) => `- ${escapeHtml(item.statement)} (${item.evidenceIds.join(", ")})`).join("\n")}`,
    `### Architecture\n${escapeHtml(summary.architecture.overview)} (${summary.architecture.evidenceIds.join(", ")})`,
    `### Takeaways\n${summary.takeaways.map((item) => `- ${escapeHtml(item.statement)} (${item.evidenceIds.join(", ")})`).join("\n")}`,
  ];
  return [
    `# Summary review: ${escapeHtml(paperTitle)}`,
    `<!-- deepgeno:draft id="${draft.id}" revision="${draft.revision}" -->`,
    "<!-- deepgeno:decision:start -->",
    "",
    "- [ ] Approve and publish",
    "- [ ] Request revision",
    "- [ ] Dismiss",
    "",
    "Priority (publication approval only):",
    "- [ ] Must-Read",
    "- [x] Recommended",
    "- [ ] Notable",
    "",
    "Reading progress:",
    "- [x] Queued",
    "- [ ] Skimmed",
    "- [ ] Read",
    "",
    "Revision request (required only when requesting revision):",
    "<!-- deepgeno:revision-note:start -->",
    REVISION_NOTE_PLACEHOLDER,
    "<!-- deepgeno:revision-note:end -->",
    "",
    "<!-- deepgeno:decision:end -->",
    `> ${escapeHtml(summary.hook)}`,
    "",
    ...statements,
    "",
    `Evidence depth: **${summary.evidenceScope}** · Model: **${escapeHtml(draft.generation.provider)}/${escapeHtml(draft.generation.model)}**`,
    "",
  ].join("\n");
}

export function parseDraftReview(
  body: string,
  draft: DraftSummary,
  options: { actor: Actor; decidedAt: string },
): DraftDecisionBatch {
  const header = body.match(
    /<!-- deepgeno:draft id="([a-zA-Z0-9._-]+)" revision="(\d+)" -->/,
  );
  if (
    !header ||
    header[1] !== draft.id ||
    Number(header[2]) !== draft.revision
  ) {
    throw new LiteratureError(
      "review_draft_mismatch",
      "Draft review body does not match stored draft",
    );
  }
  const decisionRegion = extractDecisionRegion(body, draft.id);
  const actions = [
    {
      pattern: /^\s*- \[[xX]\] Approve and publish\s*$/m,
      action: "approve" as const,
    },
    {
      pattern: /^\s*- \[[xX]\] Request revision\s*$/m,
      action: "revise" as const,
    },
    { pattern: /^\s*- \[[xX]\] Dismiss\s*$/m, action: "dismiss" as const },
  ].filter(({ pattern }) => pattern.test(decisionRegion));
  if (actions.length !== 1)
    throw new LiteratureError(
      "review_choice_count",
      `${draft.id} must have exactly one checked decision`,
    );
  const action = actions[0]!.action;
  const baseDecision = {
    draftId: draft.id,
    draftRevision: draft.revision,
    action,
    decidedAt: options.decidedAt,
    decidedBy: options.actor,
  };
  const decision =
    action === "approve"
      ? {
          ...baseDecision,
          priority: checkedValue(decisionRegion, draft.id, [
            [/^\s*- \[[xX]\] Must-Read\s*$/m, "must-read"],
            [/^\s*- \[[xX]\] Recommended\s*$/m, "recommended"],
            [/^\s*- \[[xX]\] Notable\s*$/m, "notable"],
          ] as const),
          progress: checkedValue(decisionRegion, draft.id, [
            [/^\s*- \[[xX]\] Queued\s*$/m, "queued"],
            [/^\s*- \[[xX]\] Skimmed\s*$/m, "skimmed"],
            [/^\s*- \[[xX]\] Read\s*$/m, "read"],
          ] as const),
        }
      : action === "revise"
        ? { ...baseDecision, note: revisionNote(decisionRegion, draft.id) }
        : baseDecision;
  return DraftDecisionBatchSchema.parse({
    schemaVersion: "1.0",
    id: `draft-review-${draft.id}-${sha256(JSON.stringify(decision)).slice(0, 12)}`,
    recordedAt: options.decidedAt,
    decisions: [decision],
  });
}

function revisionNote(region: string, id: string): string {
  const note = extractDelimitedRegion(
    region,
    "<!-- deepgeno:revision-note:start -->",
    "<!-- deepgeno:revision-note:end -->",
    id,
  ).trim();
  if (!note || note === REVISION_NOTE_PLACEHOLDER || note.length > 4_000) {
    throw new LiteratureError(
      "review_revision_note",
      `${id} requires revision feedback between 1 and 4000 characters`,
    );
  }
  return note;
}

function checkedValue<T extends string>(
  region: string,
  id: string,
  choices: readonly (readonly [RegExp, T])[],
): T {
  const checked = choices.filter(([pattern]) => pattern.test(region));
  if (checked.length !== 1) {
    throw new LiteratureError(
      "review_choice_count",
      `${id} must have exactly one checked status in each group`,
    );
  }
  return checked[0]![1];
}

function extractDecisionRegion(block: string, id: string): string {
  return extractDelimitedRegion(
    block,
    "<!-- deepgeno:decision:start -->",
    "<!-- deepgeno:decision:end -->",
    id,
  );
}

function extractDelimitedRegion(
  block: string,
  start: string,
  end: string,
  id: string,
): string {
  const firstStart = block.indexOf(start);
  const firstEnd = block.indexOf(end);
  if (
    firstStart < 0 ||
    firstEnd < firstStart ||
    block.indexOf(start, firstStart + start.length) >= 0 ||
    block.indexOf(end, firstEnd + end.length) >= 0
  ) {
    throw new LiteratureError(
      "review_decision_region",
      `${id} has an invalid bounded review region`,
    );
  }
  return block.slice(firstStart + start.length, firstEnd);
}

function markedBlocks(body: string, marker: RegExp): Map<string, string> {
  const matches = [...body.matchAll(marker)];
  const blocks = new Map<string, string>();
  matches.forEach((match, index) => {
    const id = match[1];
    const revision = match[2];
    if (!id || !revision || match.index === undefined) return;
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? body.length;
    const key = `${id}:${revision}`;
    if (blocks.has(key))
      throw new LiteratureError(
        "review_duplicate_marker",
        `Duplicate review marker: ${key}`,
      );
    blocks.set(key, body.slice(start, end));
  });
  return blocks;
}

function addDays(value: string, days: number): string {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString();
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
