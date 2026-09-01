import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";

import { publicPaperContentSchema } from "./lib/public-paper-schema.js";

const papers = defineCollection({
  loader: glob({
    base: "../../content/public/papers",
    pattern: "**/*.md",
  }),
  schema: publicPaperContentSchema,
});

export const collections = { papers };
