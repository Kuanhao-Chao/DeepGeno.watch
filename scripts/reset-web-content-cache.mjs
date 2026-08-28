import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const generatedContentStore = resolve(root, "apps/web/node_modules/.astro");

// Astro's single-file content store is generated state. Removing it before a
// production build ensures a deleted or revoked publication cannot survive as
// a stale static route when node_modules is reused locally or by a build cache.
await rm(generatedContentStore, { recursive: true, force: true });
