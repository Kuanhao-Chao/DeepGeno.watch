import { readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const buildRoot = resolve(root, "apps/web/dist");
const failures = [];

const requiredFiles = [
  "index.html",
  "404.html",
  "papers/index.html",
  "reading-list/index.html",
  "methodology/index.html",
  "catalog.json",
  "feed.xml",
  "robots.txt",
  "sitemap-index.xml",
  "sitemap-0.xml",
  "_headers",
];

async function readRequiredFile(path) {
  const absolutePath = resolve(buildRoot, path);

  try {
    const details = await stat(absolutePath);
    if (!details.isFile() || details.size === 0) {
      failures.push(`${path} must be a non-empty file`);
      return "";
    }
    return await readFile(absolutePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      failures.push(`${path} is missing`);
      return "";
    }
    throw error;
  }
}

const files = Object.fromEntries(
  await Promise.all(
    requiredFiles.map(async (path) => [path, await readRequiredFile(path)]),
  ),
);

const canonicalMatch = files["index.html"].match(
  /<link\s+rel="canonical"\s+href="([^"]+)"/i,
);
let canonicalUrl;

if (!canonicalMatch) {
  failures.push("index.html must contain an absolute canonical link");
} else {
  try {
    canonicalUrl = new URL(canonicalMatch[1]);
  } catch {
    failures.push("index.html canonical link must be a valid absolute URL");
  }
}

if (canonicalUrl) {
  const configuredSite = process.env.PUBLIC_SITE_URL?.trim();
  if (configuredSite) {
    try {
      const expected = new URL(configuredSite);
      if (canonicalUrl.origin !== expected.origin) {
        failures.push(
          `canonical origin ${canonicalUrl.origin} does not match PUBLIC_SITE_URL ${expected.origin}`,
        );
      }
    } catch {
      failures.push("PUBLIC_SITE_URL must be a valid absolute URL when set");
    }
  }

  for (const path of ["feed.xml", "robots.txt", "sitemap-index.xml"]) {
    if (!files[path].includes(canonicalUrl.origin)) {
      failures.push(
        `${path} must use the canonical origin ${canonicalUrl.origin}`,
      );
    }
  }
}

try {
  const catalog = JSON.parse(files["catalog.json"]);
  if (catalog?.schemaVersion !== "1.0" || !Array.isArray(catalog?.papers)) {
    failures.push(
      "catalog.json must contain schemaVersion 1.0 and a papers array",
    );
  }
} catch {
  failures.push("catalog.json must contain valid JSON");
}

const requiredHeaders = [
  "Content-Security-Policy:",
  "Referrer-Policy:",
  "X-Content-Type-Options:",
  "X-Frame-Options:",
  "Permissions-Policy:",
  "Cache-Control: public, max-age=31536000, immutable",
];

for (const header of requiredHeaders) {
  if (!files._headers.includes(header)) {
    failures.push(`_headers must contain ${header}`);
  }
}

if (failures.length > 0) {
  console.error(`Static artifact check failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(
    `Static artifact check passed (${requiredFiles.length} files verified below ${relative(root, buildRoot)}).`,
  );
}
