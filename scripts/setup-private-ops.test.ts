import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const wizardPath = path.resolve("scripts/setup-private-ops.sh");
const marker = Buffer.from("# STAGES:");
const publicRepository = "Kuanhao-Chao/DeepGeno.watch";
const stateRepository = "Kuanhao-Chao/DeepGeno.watch-state";

const expectedSeedPaths = [
  ".github/actions/bootstrap-engine/action.yml",
  ".github/workflows/ingest.yml",
  ".github/workflows/private-ops-preflight.yml",
  ".github/workflows/summarize.yml",
  ".github/workflows/triage.yml",
  ".gitignore",
  "README.md",
  "data/private/README.md",
  "engine.lock.json",
];

const repositoryVariables = [
  "CROSSREF_MAILTO",
  "DEEPGENO_CURATOR_GITHUB_LOGIN",
  "DEEPGENO_LIVE_INGESTION_ENABLED",
  "DEEPGENO_MAX_SUMMARIES_PER_RUN",
  "DEEPGENO_PUBLIC_APP_CLIENT_ID",
  "DEEPGENO_PUBLIC_REPOSITORY",
];

const synthesisVariables = [
  "DEEPGENO_MODEL_MAX_OUTPUT_TOKENS",
  "DEEPGENO_MODEL_NAME",
  "DEEPGENO_MODEL_PROVIDER",
];

const repositorySecrets = [
  "DEEPGENO_PUBLIC_APP_PRIVATE_KEY",
  "OPENALEX_API_KEY",
];

const synthesisSecrets = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"];

describe("private companion setup wizard", () => {
  it("preserves the canonical library and defines eight syntactically valid stages", async () => {
    const [wizard, stat] = await Promise.all([
      readFile(wizardPath),
      lstat(wizardPath),
    ]);
    const wizardMarker = markerOffsets(wizard);

    expect(wizardMarker).toHaveLength(1);
    const wizardPrefix = wizard.subarray(0, wizardMarker[0]);
    expect(wizardPrefix).toHaveLength(7206);
    expect(sha256(wizardPrefix)).toBe(
      "36ddf7aa3a7da152768664bddc48451a6a738f44840eb94e1c5cb014c531c02d",
    );

    const stages = wizard.subarray(wizardMarker[0]).toString("utf8");
    expect(stages).toMatch(/^TOTAL_STAGES=8$/m);
    expect(stages.match(/^stage "/gm)).toHaveLength(8);
    expect(stat.isFile()).toBe(true);
    expect(stat.mode & 0o111).not.toBe(0);

    const syntax = spawnSync("bash", ["-n", wizardPath], {
      encoding: "utf8",
    });
    expect(syntax.status, syntax.stderr).toBe(0);
  });

  it("preflights modern authenticated gh capabilities before repository mutation", async () => {
    const stages = await wizardStages();
    const mutation = stages.indexOf(`gh repo create "$STATE_REPOSITORY"`);

    expect(stages).toContain('PUBLIC_REPOSITORY="Kuanhao-Chao/DeepGeno.watch"');
    expect(stages).toContain(
      'STATE_REPOSITORY="Kuanhao-Chao/DeepGeno.watch-state"',
    );
    expect(stages).toContain("gh auth status");
    expect(stages).toContain('[[ "$AUTHENTICATED_LOGIN" == "Kuanhao-Chao" ]]');
    expect(stages).toContain("brew upgrade gh");
    expect(stages).toContain("hash -r");
    expect(stages).toMatch(/GH_MAJOR[^\n]+-lt 2/);
    expect(mutation).toBeGreaterThan(0);

    for (const command of [
      "gh secret set --help",
      "gh secret list --help",
      "gh variable set --help",
      "gh workflow run --help",
      "gh run list --help",
      "gh run watch --help",
    ]) {
      const capability = stages.indexOf(command);
      expect(capability, command).toBeGreaterThan(0);
      expect(capability, command).toBeLessThan(mutation);
    }
  });

  it("rejects unsafe public repository metadata before the first mutation", async () => {
    const stages = await wizardStages();
    const mutation = stages.indexOf(`gh repo create "$STATE_REPOSITORY"`);
    const preflightStage = stages.indexOf(
      'stage "Preflight GitHub CLI and account"',
    );
    const validation = stages.indexOf(
      "\nvalidate_public_repository\n",
      preflightStage,
    );

    expect(validation).toBeGreaterThan(0);
    expect(validation).toBeLessThan(mutation);
    expect(stages).toContain(
      `gh api "repos/$PUBLIC_REPOSITORY" --jq '[.full_name, .private, .fork, .archived, (.default_branch // "")] | @tsv'`,
    );

    const valid = [publicRepository, "false", "false", "false", "main"];
    expect(
      runBashFunction(stages, "is_exact_public_repository_metadata", valid)
        .status,
    ).toBe(0);

    for (const invalid of [
      [stateRepository, "false", "false", "false", "main"],
      [publicRepository, "true", "false", "false", "main"],
      [publicRepository, "false", "true", "false", "main"],
      [publicRepository, "false", "false", "true", "main"],
      [publicRepository, "false", "false", "false", "master"],
    ]) {
      expect(
        runBashFunction(stages, "is_exact_public_repository_metadata", invalid)
          .status,
        invalid.join("\t"),
      ).not.toBe(0);
    }
  });

  it("validates the fixed private repository and seeds only the rendered companion", async () => {
    const stages = await wizardStages();

    expect(stages).toContain('"$STATE_FULL_NAME" == "$STATE_REPOSITORY"');
    expect(stages).toContain('"$STATE_PRIVATE" == "true"');
    expect(stages).toContain('"$STATE_FORK" == "false"');
    expect(stages).toContain('"$STATE_ARCHIVED" == "false"');
    expect(stages).toContain('gh repo create "$STATE_REPOSITORY" --private');
    const create = stages.indexOf(
      'gh repo create "$STATE_REPOSITORY" --private',
    );
    const createConfirmation = stages.lastIndexOf("confirm ", create);
    expect(createConfirmation).toBeGreaterThan(0);
    expect(createConfirmation).toBeLessThan(create);
    expect(stages).toContain(
      'STATE_ROOT="$PUBLIC_PARENT/DeepGeno.watch-state"',
    );
    expect(stages).toContain('[[ -d "$STATE_ROOT/.git" ]]');
    expect(stages).toContain(
      'STATE_ORIGIN="https://github.com/Kuanhao-Chao/DeepGeno.watch-state.git"',
    );
    expect(stages).toContain(
      'git -C "$STATE_ROOT" remote get-url --all origin',
    );
    expect(stages).toContain(
      'git -C "$STATE_ROOT" remote get-url --all --push origin',
    );
    expect(stages).toContain(
      'has_exact_remote_url "$STATE_ORIGIN" "${STATE_FETCH_URLS[@]}"',
    );
    expect(stages).toContain(
      'has_exact_remote_url "$STATE_ORIGIN" "${STATE_PUSH_URLS[@]}"',
    );
    expect(stages).toContain(
      'PUBLIC_HTTPS_ORIGIN="https://github.com/Kuanhao-Chao/DeepGeno.watch.git"',
    );
    expect(stages).toContain(
      'PUBLIC_SSH_ORIGIN="git@github.com:Kuanhao-Chao/DeepGeno.watch.git"',
    );
    expect(stages).toContain(
      'git -C "$PUBLIC_ROOT" remote get-url --all origin',
    );
    expect(stages).toContain(
      'has_exact_remote_url "$PUBLIC_HTTPS_ORIGIN" "${PUBLIC_FETCH_URLS[@]}"',
    );
    expect(stages).toContain(
      'has_exact_remote_url "$PUBLIC_SSH_ORIGIN" "${PUBLIC_FETCH_URLS[@]}"',
    );
    expect(stages).not.toContain("mapfile");
    expect(stages).toContain('[[ "$PUBLIC_HEAD" == "$PIN" ]]');

    expect(
      runBashFunction(stages, "has_exact_remote_url", [
        "https://github.com/example/repository.git",
        "https://github.com/example/repository.git",
      ]).status,
    ).toBe(0);
    const noConfiguredUrl = runBashFunction(stages, "has_exact_remote_url", [
      "https://github.com/example/repository.git",
    ]);
    expect(noConfiguredUrl.status).not.toBe(0);
    expect(noConfiguredUrl.stderr).not.toContain("unbound variable");
    for (const configured of [
      [
        "https://github.com/example/repository.git",
        "https://attacker.invalid/redirect.git",
      ],
      ["https://attacker.invalid/redirect.git"],
    ]) {
      expect(
        runBashFunction(stages, "has_exact_remote_url", [
          "https://github.com/example/repository.git",
          ...configured,
        ]).status,
        configured.join("\n"),
      ).not.toBe(0);
    }

    expect(stages).toMatch(
      /node scripts\/github\/render-private-ops\.mjs\s+\\\n\s+--destination "\$STATE_ROOT"\s+\\\n\s+--repository Kuanhao-Chao\/DeepGeno\.watch\s+\\\n\s+--commit "\$PIN"/,
    );
    expect(stages).toContain('--commit "$PIN" --repin');
    const repinConditional = stages.indexOf(
      'if [[ "$CURRENT_PIN" != "$PIN" ]]; then',
    );
    const repinCall = stages.indexOf("    render_repin", repinConditional);
    const repinConfirmation = stages.indexOf("    confirm ", repinConditional);
    expect(repinConditional).toBeGreaterThan(0);
    expect(repinConfirmation).toBeGreaterThan(repinConditional);
    expect(repinConfirmation).toBeLessThan(repinCall);
    expect(
      stages.lastIndexOf(
        'git -C "$STATE_ROOT" var GIT_AUTHOR_IDENT',
        repinCall,
      ),
    ).toBeGreaterThan(repinConfirmation);
    const repinBranch = stages.slice(
      repinConditional,
      stages.indexOf("  else", repinCall),
    );
    expect(repinBranch).toMatch(
      /git -C "\$STATE_ROOT" push origin HEAD:main[\s\S]+render_pin[\s\S]+same-pin repin verification must be a clean no-op/,
    );

    expect(parseBashArray(stages, "SEED_PATHS")).toEqual(expectedSeedPaths);
    expect(stages).toContain('git -C "$STATE_ROOT" add -- "${SEED_PATHS[@]}"');
    expect(stages).toContain('git -C "$STATE_ROOT" add -- engine.lock.json');
    expect(stages).toContain('git -C "$STATE_ROOT" push origin HEAD:main');
    expect(stages).not.toMatch(/git[^\n]*push[^\n]*(?:--force|-f(?:\s|$))/);

    const headBranch = stages.indexOf(
      'if git -C "$STATE_ROOT" rev-parse --verify HEAD',
    );
    const emptyBranch = stages.indexOf("else\n  git -C", headBranch);
    const emptyRender = stages.indexOf("  render_pin", emptyBranch);
    expect(
      stages.indexOf('git -C "$STATE_ROOT" var GIT_AUTHOR_IDENT', emptyBranch),
    ).toBeLessThan(emptyRender);
    const cleanGate = stages.indexOf(
      "The companion checkout must be clean before rendering.",
    );
    expect(cleanGate).toBeGreaterThan(headBranch);
    expect(cleanGate).toBeLessThan(emptyBranch);
  });

  it("requires private HTTPS Git access after validation and before clone or render", async () => {
    const stages = await wizardStages();
    const companionStage = stages.indexOf(
      'stage "Create or validate the private companion"',
    );
    const stateValidation = stages.indexOf(
      "\nvalidate_state_repository\n",
      companionStage,
    );
    const accessCheck = stages.indexOf(
      'GIT_TERMINAL_PROMPT=0 git ls-remote "$STATE_ORIGIN"',
    );
    const clone = stages.indexOf('git clone "$STATE_ORIGIN" "$STATE_ROOT"');
    const firstRender = stages.indexOf("render_pin", clone);

    expect(stateValidation).toBeGreaterThan(0);
    expect(accessCheck).toBeGreaterThan(stateValidation);
    expect(accessCheck).toBeLessThan(clone);
    expect(accessCheck).toBeLessThan(firstRender);
    expect(stages.slice(accessCheck, clone)).not.toContain("--exit-code");
    expect(stages.slice(accessCheck, clone)).toContain("HTTPS");
    expect(stages.slice(accessCheck, clone)).toContain("manually");
    expect(stages.slice(accessCheck, clone)).toContain("rerun");
  });

  it("recovers an exactly staged initial seed and rejects mixed or extra Git state", async () => {
    const stages = await wizardStages();
    const fixtureRoot = await mkdtemp(
      path.join(os.tmpdir(), "deepgeno-private-seed-"),
    );

    try {
      expect(
        runGit(fixtureRoot, ["init", "--initial-branch=main"]).status,
      ).toBe(0);
      for (const seedPath of expectedSeedPaths) {
        const absolutePath = path.join(fixtureRoot, seedPath);
        await mkdir(path.dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, "fixture\n", "utf8");
      }

      const untracked = gitStatus(fixtureRoot);
      expect(stages).toContain(
        'is_exact_initial_seed_status "$SEED_STATUS" "${SEED_PATHS[@]}"',
      );
      expect(
        runBashFunction(stages, "is_exact_initial_seed_status", [
          untracked,
          ...expectedSeedPaths,
        ]).status,
      ).toBe(0);

      expect(
        runGit(fixtureRoot, ["add", "--", ...expectedSeedPaths]).status,
      ).toBe(0);
      const staged = gitStatus(fixtureRoot);
      expect(staged).toContain("A  engine.lock.json");
      expect(
        runBashFunction(stages, "is_exact_initial_seed_status", [
          staged,
          ...expectedSeedPaths,
        ]).status,
      ).toBe(0);

      expect(
        runGit(fixtureRoot, ["reset", "--", expectedSeedPaths[0]]).status,
      ).toBe(0);
      const mixed = gitStatus(fixtureRoot);
      expect(
        runBashFunction(stages, "is_exact_initial_seed_status", [
          mixed,
          ...expectedSeedPaths,
        ]).status,
      ).not.toBe(0);

      expect(
        runGit(fixtureRoot, ["add", "--", expectedSeedPaths[0]]).status,
      ).toBe(0);
      await writeFile(path.join(fixtureRoot, "unexpected.txt"), "unexpected\n");
      const extra = gitStatus(fixtureRoot);
      expect(
        runBashFunction(stages, "is_exact_initial_seed_status", [
          extra,
          ...expectedSeedPaths,
        ]).status,
      ).not.toBe(0);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("routes every workflow variable and secret to its intended scope", async () => {
    const stages = await wizardStages();
    const references = await workflowReferences();

    expect(references.variables).toEqual(
      [...repositoryVariables, ...synthesisVariables].sort(),
    );
    expect(references.secrets).toEqual(
      [...repositorySecrets, ...synthesisSecrets].sort(),
    );

    for (const name of repositoryVariables) {
      expect(stages, name).toMatch(
        new RegExp(
          `gh variable set ${name} --repo "\\$STATE_REPOSITORY" --body`,
        ),
      );
    }
    for (const name of synthesisVariables) {
      expect(stages, name).toMatch(
        new RegExp(
          `gh variable set ${name} --env synthesis --repo "\\$STATE_REPOSITORY" --body`,
        ),
      );
    }

    expect(stages).toContain(
      'gh secret set DEEPGENO_PUBLIC_APP_PRIVATE_KEY --repo "$STATE_REPOSITORY" < "$PEM_PATH"',
    );
    expect(stages).not.toMatch(
      /gh secret set (?:OPENAI_API_KEY|ANTHROPIC_API_KEY|OPENALEX_API_KEY)/,
    );
    expect(stages).toContain("OPENAI_API_KEY");
    expect(stages).toContain("ANTHROPIC_API_KEY");
    expect(stages).toContain("OPENALEX_API_KEY");
    expect(stages).toContain("browser-to-browser");
    expect(stages).toContain(
      '[[ "$SYNTHESIS_SECRET_NAMES" == "OPENAI_API_KEY" ]]',
    );
  });

  it("fails closed when private environment credentials are unavailable", async () => {
    const stages = await wizardStages();
    const capabilityGate = stages.indexOf(
      'confirm "Confirm private-repository environment secrets and variables are available, synthesis is restricted to main, Prevent self-review is disabled, and any required reviewer was added only when this private-repository plan supports it."',
    );
    const firstEnvironmentWrite = stages.indexOf(
      "gh variable set DEEPGENO_MODEL_PROVIDER --env synthesis",
    );

    expect(capabilityGate).toBeGreaterThan(0);
    expect(capabilityGate).toBeLessThan(firstEnvironmentWrite);
    expect(stages).toContain(
      'abort "Private environment secrets are required. Upgrade to an eligible paid GitHub plan, then rerun; never fall back to repository or public provider secrets."',
    );
    expect(stages).toContain(
      "Required reviewers are conditional on private-repository plan support",
    );
    expect(stages).toContain(
      "Leave Prevent self-review disabled in this single-curator topology",
    );
    expect(stages).toContain(
      "never move provider keys to repository or public secrets",
    );
    expect(stages).toContain(
      'gh variable set DEEPGENO_MODEL_PROVIDER --env synthesis --repo "$STATE_REPOSITORY"',
    );
    expect(stages).toContain(
      'gh secret list --env synthesis --repo "$STATE_REPOSITORY"',
    );
    expect(stages).not.toMatch(
      /gh secret set (?:OPENAI_API_KEY|ANTHROPIC_API_KEY)(?:\s|$)/,
    );
    expect(stages).not.toMatch(/^\s*gh api[^\n]*(?:account plan|billing)/im);
  });

  it("scopes every gh configuration and run command to the private companion", async () => {
    const stages = await wizardStages();
    const commands = stages
      .split("\n")
      .map((line) => line.trim())
      .filter((line) =>
        /^gh (?:secret|variable|workflow|run) (?:set|list|run|watch)/.test(
          line,
        ),
      )
      .filter((line) => !line.includes("--help"));

    expect(commands.length).toBeGreaterThan(10);
    for (const command of commands) {
      expect(command, command).toContain('--repo "$STATE_REPOSITORY"');
      expect(command, command).not.toContain(publicRepository);
    }
    expect(stages).not.toContain("DEEPGENO_PUBLIC_GITHUB_TOKEN=");
    expect(stages).not.toContain("GH_TOKEN=");
  });

  it("never uses ambient persistence, mutable auth configuration, or destructive shortcuts", async () => {
    const stages = await wizardStages();

    for (const forbidden of [
      "write_env",
      "ask_secret",
      "set_secret",
      "set_var",
      ".env",
      "$HOME",
      "GH_CONFIG_DIR",
      "GH_REPO",
      "gh auth login",
      "gh config",
      "git config",
      "git reset",
      "git clean",
      "git push --force",
      "gh repo delete",
    ]) {
      expect(stages, forbidden).not.toContain(forbidden);
    }
    expect(stages).not.toMatch(/(?:^|\s)~(?:\/|\s|$)/m);
    expect(stages).not.toMatch(/git[^\n]*add\s+(?:\.|-A|--all)(?:\s|$)/);
    expect(stages).not.toMatch(/^\s*(?:rm|unlink)\s/m);
    expect(stages).not.toMatch(/^\s*export\s+[^\n]*(?:TOKEN|KEY)/m);
    expect(stages).not.toMatch(/^\s*(?:echo|cat)\s+[^\n]*(?:TOKEN|KEY|PEM)/m);
    expect(stages).not.toMatch(/^\s*gh secret delete\b/m);
  });

  it("streams only the validated PEM and keeps provider credentials in the browser", async () => {
    const stages = await wizardStages();

    expect(stages).toContain('[[ "$PEM_PATH" == /* ]]');
    expect(stages).toContain('[[ -f "$PEM_PATH" && ! -L "$PEM_PATH" ]]');
    expect(stages).toContain('[[ "$PEM_CANONICAL" == "$PEM_PATH" ]]');
    expect(stages).toContain(
      'gh secret set DEEPGENO_PUBLIC_APP_PRIVATE_KEY --repo "$STATE_REPOSITORY" < "$PEM_PATH"',
    );
    expect(stages).toContain(
      "unset PEM_PATH PEM_PARENT PEM_BASENAME PEM_CANONICAL",
    );
    expect(stages).not.toMatch(/^\s*cat\b[^\n]*\$PEM_PATH/m);
    expect(stages).not.toContain('$(< "$PEM_PATH")');
    expect(stages).not.toContain("PEM_CONTENT");
    expect(stages).toContain("Remove the downloaded PEM manually");
  });

  it("guides one least-privilege App installation on exactly two repositories", async () => {
    const stages = await wizardStages();

    expect(stages).toContain("Disable the webhook");
    expect(stages).toContain("Metadata read-only");
    expect(stages).toContain("Contents, Pull requests, and Issues read/write");
    expect(stages).toContain("leave every other permission at no access");
    expect(stages).toContain(
      "Select exactly DeepGeno.watch-state and DeepGeno.watch",
    );
    expect(stages).toContain(
      "no organization-wide or all-repository installation",
    );
    expect(stages).toContain("Client ID (not the numeric App ID)");
    expect(stages).toContain(
      'confirm "Confirm the App has webhook disabled, only the stated permission ceiling, owner Kuanhao-Chao, and exactly the two selected repositories."',
    );
  });

  it("dispatches one new main preflight run and leaves cutover destructive work manual", async () => {
    const stages = await wizardStages();

    expect(stages).toContain(
      'gh workflow run private-ops-preflight.yml --repo "$STATE_REPOSITORY" --ref main',
    );
    expect(stages).toContain('[[ "$PREFLIGHT_RUN_ID" != "$PREVIOUS_RUN_ID" ]]');
    expect(stages).toContain(
      '[[ "$PREFLIGHT_HEAD_SHA" == "$STATE_MAIN_SHA" ]]',
    );
    expect(stages).toContain(
      'gh run watch "$PREFLIGHT_RUN_ID" --repo "$STATE_REPOSITORY" --exit-status',
    );
    expect(stages).toContain("CI / verify");
    expect(stages).toContain("DEEPGENO_GITHUB_TOKEN");
    expect(stages).toContain("GitHub Settings");
    expect(stages).toContain("Task 5");
    expect(stages).not.toMatch(/^\s*gh secret delete\b/m);
  });

  it("places verified Preview Access before the first preview-producing public delivery", async () => {
    const stages = await wizardStages();
    const accessGate = stages.indexOf(
      "Enable Cloudflare Access for Worker Preview URLs",
    );
    const firstDelivery = stages.indexOf(
      "Only after Preview Access passes, allow Gate 2 approval to open the first one-file public PR",
    );

    expect(accessGate).toBeGreaterThan(0);
    expect(firstDelivery).toBeGreaterThan(accessGate);
  });
});

async function wizardStages(): Promise<string> {
  const bytes = await readFile(wizardPath);
  const offsets = markerOffsets(bytes);
  expect(offsets).toHaveLength(1);
  return bytes.subarray(offsets[0]).toString("utf8");
}

function markerOffsets(source: Buffer): number[] {
  const offsets: number[] = [];
  let from = 0;
  while (from < source.length) {
    const offset = source.indexOf(marker, from);
    if (offset === -1) break;
    if (offset === 0 || source[offset - 1] === 0x0a) offsets.push(offset);
    from = offset + marker.length;
  }
  return offsets;
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseBashArray(source: string, name: string): string[] {
  const body = new RegExp(`${name}=\\(\\n(?<body>[\\s\\S]*?)^\\)`, "m").exec(
    source,
  )?.groups?.body;
  expect(body, name).toBeDefined();
  return [...body!.matchAll(/^\s+"([^"]+)"$/gm)].map((match) => match[1]);
}

async function workflowReferences(): Promise<{
  variables: string[];
  secrets: string[];
}> {
  const workflowNames = [
    "ingest.yml",
    "private-ops-preflight.yml",
    "summarize.yml",
    "triage.yml",
  ];
  const workflows = await Promise.all(
    workflowNames.map((name) =>
      readFile(
        path.resolve("templates/private-ops/.github/workflows", name),
        "utf8",
      ),
    ),
  );
  const source = workflows.join("\n");
  return {
    variables: uniqueMatches(source, /\bvars\.([A-Z0-9_]+)/g),
    secrets: uniqueMatches(source, /\bsecrets\.([A-Z0-9_]+)/g),
  };
}

function uniqueMatches(source: string, pattern: RegExp): string[] {
  return [
    ...new Set([...source.matchAll(pattern)].map((match) => match[1])),
  ].sort();
}

function runBashFunction(
  stages: string,
  functionName: string,
  args: string[],
): ReturnType<typeof spawnSync> {
  const functionSource = extractBashFunction(stages, functionName);
  return spawnSync(
    "bash",
    [
      "-c",
      `set -u\n${functionSource}\n${functionName} "$@"`,
      functionName,
      ...args,
    ],
    { encoding: "utf8" },
  );
}

function extractBashFunction(source: string, functionName: string): string {
  const match = new RegExp(
    `^${functionName}\\(\\) \\{\\n[\\s\\S]*?^\\}`,
    "m",
  ).exec(source);
  expect(match?.[0], functionName).toBeDefined();
  return match![0];
}

function runGit(cwd: string, args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

function gitStatus(cwd: string): string {
  const result = runGit(cwd, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trimEnd();
}
