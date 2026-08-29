import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, relative } from "node:path";
import {
  privateMarkerPattern,
  publicProvenanceLeakPattern,
} from "./privacy-patterns.mjs";

const root = resolve(import.meta.dirname, "..");
const privateRoot = resolve(root, "data/private");
const buildRoot = resolve(root, "apps/web/dist");

async function filesBelow(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map((entry) => {
        const path = resolve(directory, entry.name);
        return entry.isDirectory() ? filesBelow(path) : [path];
      }),
    );
    return nested.flat();
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

const buildFiles = await filesBelow(buildRoot);
const violations = [];
const buildText = [];

for (const file of buildFiles) {
  if ((await stat(file)).size > 10_000_000) continue;
  const contents = await readFile(file, "utf8").catch(() => "");
  buildText.push({ file, contents });
  if (
    privateMarkerPattern.test(contents) ||
    publicProvenanceLeakPattern.test(contents)
  ) {
    violations.push(
      `${relative(root, file)} contains a private path, secret, or provenance marker`,
    );
  }
}

for (const privateFile of await filesBelow(privateRoot)) {
  if (privateFile.endsWith("README.md")) continue;
  const contents = await readFile(privateFile, "utf8").catch(() => "");
  const distinctive = contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 120);
  for (const line of distinctive) {
    const leaked = buildText.find(({ contents: output }) =>
      output.includes(line),
    );
    if (leaked) {
      violations.push(
        `${relative(root, leaked.file)} contains private text from ${relative(root, privateFile)}`,
      );
      break;
    }
  }
}

if (violations.length > 0) {
  console.error(`Privacy check failed:\n- ${violations.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(
    `Privacy check passed (${buildFiles.length} build files inspected).`,
  );
}
