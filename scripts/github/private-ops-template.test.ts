import { access, lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const templateRoot = path.resolve("templates/private-ops");

const expectedTemplateFiles = [
  ".github/actions/bootstrap-engine/action.yml",
  ".github/workflows/ingest.yml",
  ".github/workflows/private-ops-preflight.yml",
  ".github/workflows/summarize.yml",
  ".github/workflows/triage.yml",
  ".gitignore",
  "README.md",
  "data/private/README.md",
];

describe("private operations companion template", () => {
  it("contains only the allowlisted private state and operation files", async () => {
    await expect(listFiles(templateRoot)).resolves.toEqual(
      expectedTemplateFiles,
    );
    for (const relative of expectedTemplateFiles) {
      const stat = await lstat(path.join(templateRoot, relative));
      expect(stat.isFile(), relative).toBe(true);
      expect(stat.isSymbolicLink(), relative).toBe(false);
    }
    await expect(
      access(path.join(templateRoot, "engine.lock.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("bootstraps only the fixed, pinned public engine outside private state", async () => {
    const action = await template(
      ".github/actions/bootstrap-engine/action.yml",
    );

    for (const required of [
      "$GITHUB_WORKSPACE",
      "$RUNNER_TEMP/deepgeno-engine",
      "engine.lock.json",
      "https://github.com/Kuanhao-Chao/DeepGeno.watch.git",
      'fetch --no-tags origin "$commit"',
      "FETCH_HEAD^{commit}",
      "refs/remotes/origin/main",
      'merge-base --is-ancestor "$commit"',
      'checkout --detach "$commit"',
      "HEAD^{commit}",
      "scripts/github/automation.mjs",
      "scripts/github/workflow-lib.mjs",
      "packages/literature/package.json",
      "prompts/summary/v1.md",
    ]) {
      expect(action, required).toContain(required);
    }
    expect(action).toMatch(/Object\.keys\(lock\).*repository.*commit/s);
    expect(action).toContain(
      "engine.lock.json must use deterministic canonical bytes",
    );
    expect(action).toMatch(/\[\[.*-L.*engine\.lock\.json/s);
    expect(action).toMatch(
      /engine_root.*workspace_root.*\*|workspace_root.*engine_root.*\*/s,
    );
    expect(action).toMatch(/\[\[.*-e.*engine_root.*-L.*engine_root/s);
    expect(action).not.toContain("actions/checkout");
    expect(action).not.toContain("${{ secrets.");
    expect(action).not.toMatch(/https:\/\/[^\s]+@github\.com/);
  });

  it("wraps every operation around trusted private main and explicit roots", async () => {
    const workflows = await Promise.all(
      ["ingest.yml", "triage.yml", "summarize.yml"].map((name) =>
        template(`.github/workflows/${name}`),
      ),
    );
    const joined = workflows.join("\n");

    for (const workflow of workflows) {
      const checkoutCount = occurrences(workflow, "uses: actions/checkout@v6");
      expect(checkoutCount).toBeGreaterThan(0);
      expect(
        occurrences(workflow, "repository: Kuanhao-Chao/DeepGeno.watch-state"),
      ).toBe(checkoutCount);
      expect(occurrences(workflow, "ref: main")).toBe(checkoutCount);
      expect(
        occurrences(workflow, "uses: ./.github/actions/bootstrap-engine"),
      ).toBe(checkoutCount);
      expect(workflow).toContain(
        "DEEPGENO_PROJECT_ROOT: ${{ runner.temp }}/deepgeno-engine",
      );
      expect(workflow).toContain(
        "DEEPGENO_STATE_ROOT: ${{ github.workspace }}",
      );
      expect(workflow).not.toMatch(
        /repository:\s*Kuanhao-Chao\/DeepGeno\.watch\s*$/m,
      );
      expect(workflow).not.toContain("path: deepgeno-engine");
      expect(workflow).not.toContain("DEEPGENO_GITHUB_TOKEN");
      expect(workflow).not.toContain("|| github.token");
      for (const job of workflowJobBlocks(workflow)) {
        expect(job).toContain(
          "DEEPGENO_PROJECT_ROOT: ${{ runner.temp }}/deepgeno-engine",
        );
        expect(job).toContain("DEEPGENO_STATE_ROOT: ${{ github.workspace }}");
        expect(job).toContain("uses: actions/checkout@v6");
        expect(job).toContain("repository: Kuanhao-Chao/DeepGeno.watch-state");
        expect(job).toContain("ref: main");
        expect(job).toContain("uses: ./.github/actions/bootstrap-engine");
        expect(job).toContain("run: npm ci");
        expect(job).toContain(
          'node "$DEEPGENO_PROJECT_ROOT/scripts/github/automation.mjs"',
        );
      }
    }

    for (const command of [
      "assert-private",
      "ingest",
      "triage-check",
      "record-triage",
      "record-summary",
      "validate-model",
      "synthesize",
      "publish-approved",
    ]) {
      expect(joined, command).toContain(
        `node "$DEEPGENO_PROJECT_ROOT/scripts/github/automation.mjs" ${command}`,
      );
    }
    expect(joined).not.toMatch(/run:\s*node scripts\/github\/automation\.mjs/);
    expect(joined).toContain(
      "working-directory: ${{ runner.temp }}/deepgeno-engine",
    );
  });

  it("preserves bounded ingestion controls and a secret-free trusted-main review", async () => {
    const ingest = await template(".github/workflows/ingest.yml");
    const triage = await template(".github/workflows/triage.yml");

    for (const marker of [
      'cron: "17 6 * * *"',
      "timezone: America/Los_Angeles",
      "mode:",
      "from:",
      "through:",
      "backfill_days:",
      "batch_days:",
      "shadow:",
      "DEEPGENO_LIVE_INGESTION_ENABLED",
      "CROSSREF_MAILTO",
      "OPENALEX_API_KEY",
    ]) {
      expect(ingest, marker).toContain(marker);
    }
    expect(triage).toContain("persist-credentials: false");
    expect(triage).not.toContain("create-github-app-token");
    expect(triage).not.toContain("${{ secrets.");
    expect(triage).not.toContain("OPENAI_API_KEY");
    expect(triage).not.toContain("ANTHROPIC_API_KEY");
  });

  it("mints one-repository least-permission App tokens with the v3 client-ID contract", async () => {
    const ingest = await template(".github/workflows/ingest.yml");
    const summarize = await template(".github/workflows/summarize.yml");
    const preflight = await template(
      ".github/workflows/private-ops-preflight.yml",
    );
    const blocks = [ingest, summarize, preflight].flatMap(appTokenBlocks);

    expect(blocks).toHaveLength(10);
    for (const block of blocks) {
      expect(block).toContain("uses: actions/create-github-app-token@v3");
      expect(block).toContain(
        "client-id: ${{ vars.DEEPGENO_PUBLIC_APP_CLIENT_ID }}",
      );
      expect(block).toContain(
        "private-key: ${{ secrets.DEEPGENO_PUBLIC_APP_PRIVATE_KEY }}",
      );
      expect(block).toContain("owner: Kuanhao-Chao");
      expect(occurrences(block, "repositories:")).toBe(1);
      expect(block).not.toContain("app-id:");
      expect(block).not.toContain("secrets.DEEPGENO_PUBLIC_APP_CLIENT_ID");
    }

    expect(
      blocks.filter((block) =>
        /repositories: DeepGeno\.watch-state\s/m.test(block),
      ),
    ).toHaveLength(8);
    expect(
      blocks.filter((block) => /repositories: DeepGeno\.watch\s/m.test(block)),
    ).toHaveLength(2);

    const privateBlocks = blocks.filter((block) =>
      /repositories: DeepGeno\.watch-state\s/m.test(block),
    );
    expect(
      privateBlocks.filter(
        (block) =>
          permissionLines(block).join(",") ===
          "contents:write,issues:write,pull-requests:write",
      ),
    ).toHaveLength(4);
    expect(
      privateBlocks.filter(
        (block) => permissionLines(block).join(",") === "contents:write",
      ),
    ).toHaveLength(3);
    expect(
      privateBlocks.filter(
        (block) => permissionLines(block).join(",") === "contents:read",
      ),
    ).toHaveLength(1);

    const publicBlocks = blocks.filter((block) =>
      /repositories: DeepGeno\.watch\s/m.test(block),
    );
    expect(permissionLines(publicBlocks[0])).toEqual([
      "contents:write",
      "pull-requests:write",
    ]);
    expect(permissionLines(publicBlocks[1])).toEqual(["contents:read"]);

    expect(preflight).toContain("gh api --paginate /installation/repositories");
    expect(preflight).toContain('[[ "${#repositories[@]}" -eq 1 ]]');
    expect(preflight).toContain(
      '[[ "${repositories[0]}" == "$EXPECTED_REPOSITORY" ]]',
    );
  });

  it("keeps synthesis credentials in protected synthesis jobs and delivery tokens transient", async () => {
    const summarize = await template(".github/workflows/summarize.yml");
    const jobBlocks = workflowJobBlocks(summarize);
    const providerBlocks = jobBlocks.filter(
      (block) =>
        block.includes("OPENAI_API_KEY") || block.includes("ANTHROPIC_API_KEY"),
    );

    expect(providerBlocks).toHaveLength(3);
    for (const block of providerBlocks) {
      expect(block).toContain("environment: synthesis");
      expect(block).toContain(
        "OPENAI_API_KEY: ${{ vars.DEEPGENO_MODEL_PROVIDER == 'openai' && secrets.OPENAI_API_KEY || '' }}",
      );
      expect(block).toContain(
        "ANTHROPIC_API_KEY: ${{ vars.DEEPGENO_MODEL_PROVIDER == 'anthropic' && secrets.ANTHROPIC_API_KEY || '' }}",
      );
    }
    for (const block of jobBlocks.filter(
      (block) => !block.includes("environment: synthesis"),
    )) {
      expect(block).not.toContain("OPENAI_API_KEY");
      expect(block).not.toContain("ANTHROPIC_API_KEY");
    }
    expect(occurrences(summarize, "DEEPGENO_CURATOR_GITHUB_LOGIN:")).toBe(2);
    expect(occurrences(summarize, "DEEPGENO_PUBLIC_GITHUB_TOKEN:")).toBe(1);
    expect(occurrences(summarize, "GH_TOKEN:")).toBe(3);
  });

  it("documents exactly the variables and secrets consumed by the wrappers", async () => {
    const workflowText = (
      await Promise.all(
        [
          "ingest.yml",
          "triage.yml",
          "summarize.yml",
          "private-ops-preflight.yml",
        ].map((name) => template(`.github/workflows/${name}`)),
      )
    ).join("\n");
    const readme = await template("README.md");
    const variables = references(workflowText, /vars\.([A-Z0-9_]+)/g);
    const secrets = references(workflowText, /secrets\.([A-Z0-9_]+)/g);

    expect(variables).toEqual([
      "CROSSREF_MAILTO",
      "DEEPGENO_CURATOR_GITHUB_LOGIN",
      "DEEPGENO_LIVE_INGESTION_ENABLED",
      "DEEPGENO_MAX_SUMMARIES_PER_RUN",
      "DEEPGENO_MODEL_MAX_OUTPUT_TOKENS",
      "DEEPGENO_MODEL_NAME",
      "DEEPGENO_MODEL_PROVIDER",
      "DEEPGENO_PUBLIC_APP_CLIENT_ID",
      "DEEPGENO_PUBLIC_REPOSITORY",
    ]);
    expect(secrets).toEqual([
      "ANTHROPIC_API_KEY",
      "DEEPGENO_PUBLIC_APP_PRIVATE_KEY",
      "OPENAI_API_KEY",
      "OPENALEX_API_KEY",
    ]);
    for (const name of [...variables, ...secrets]) {
      expect(readme, name).toContain(name);
    }
    expect(readme).toContain("exactly one of");
    expect(readme).toContain("synthesis");
  });

  it("leaves all operational workflows out of the public repository", async () => {
    for (const name of ["ingest.yml", "triage.yml", "summarize.yml"]) {
      await expect(
        access(path.resolve(".github/workflows", name)),
      ).rejects.toMatchObject({ code: "ENOENT" });
    }
  });
});

async function template(relative: string): Promise<string> {
  return readFile(path.join(templateRoot, relative), "utf8");
}

function occurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

function appTokenBlocks(value: string): string[] {
  return value
    .split(/(?=^      - )/m)
    .filter((block) => block.includes("actions/create-github-app-token@v3"));
}

function permissionLines(value: string): string[] {
  return [...value.matchAll(/permission-([a-z-]+): (read|write)/g)]
    .map((match) => `${match[1]}:${match[2]}`)
    .sort();
}

function workflowJobBlocks(value: string): string[] {
  const jobs = value.split(/^jobs:\s*$/m)[1] ?? "";
  return jobs
    .split(/(?=^  [a-z][a-z0-9-]+:\s*$)/m)
    .filter((block) => /^  [a-z][a-z0-9-]+:\s*$/m.test(block));
}

function references(value: string, pattern: RegExp): string[] {
  return [
    ...new Set([...value.matchAll(pattern)].map((match) => match[1])),
  ].sort();
}

async function listFiles(root: string, relative = ""): Promise<string[]> {
  const entries = await readdir(path.join(root, relative), {
    withFileTypes: true,
  });
  const files: string[] = [];
  for (const entry of entries) {
    const child = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(root, child)));
    else files.push(child);
  }
  return files.sort();
}
