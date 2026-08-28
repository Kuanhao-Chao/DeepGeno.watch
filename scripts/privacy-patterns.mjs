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
