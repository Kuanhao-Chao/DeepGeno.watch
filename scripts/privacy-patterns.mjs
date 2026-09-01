export const privateMarkerPattern = new RegExp(
  [
    String.raw`data[\\/]private`,
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    String.raw`sk-(?:proj|svcacct)-[A-Za-z0-9_-]{20,}`,
    String.raw`sk-ant-[A-Za-z0-9_-]{20,}`,
    String.raw`sk-[A-Za-z0-9]{20,}`,
  ].join("|"),
  "i",
);

// These fields are meaningful only inside the private review and synthesis
// workflow. Public v2 frontmatter may expose anonymous approval time, but not
// the identities, workflow records, or integrity inputs behind it.
export const publicProvenanceLeakPattern = new RegExp(
  [
    "paperId",
    "draftId",
    "draftRevision",
    "approvedBy",
    "pullRequestUrl",
    "commitSha",
    "inputSha256",
    "contentSha256",
    "textSha256",
    "recordSha256",
    "requestId",
    "inputTokens",
    "outputTokens",
  ].join("|"),
);
