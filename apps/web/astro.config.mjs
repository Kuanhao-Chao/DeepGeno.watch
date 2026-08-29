import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

const site =
  process.env.PUBLIC_SITE_URL?.trim() ||
  "https://deepgeno-watch.khchao.workers.dev";

export default defineConfig({
  site,
  output: "static",
  integrations: [sitemap()],
  build: {
    format: "directory",
  },
});
