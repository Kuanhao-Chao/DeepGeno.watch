import rss from "@astrojs/rss";
import type { APIRoute } from "astro";

import { getPapers, paperDate, paperHref } from "../lib/papers";

export const GET: APIRoute = async ({ site }) => {
  if (!site) {
    throw new Error(
      "Astro's site URL must be configured before generating the RSS feed.",
    );
  }

  const papers = await getPapers();

  return rss({
    title: "DeepGeno Watch",
    description:
      "Human-approved reading for computational genomics, sequence-to-function models, and genomic language models.",
    site,
    items: papers.map((paper) => ({
      title: paper.data.title,
      description: paper.data.hook,
      link: paperHref(paper),
      pubDate: paperDate(paper),
      author: paper.data.authors.join(", "),
      categories: [...paper.data.topics, ...paper.data.tags],
    })),
    customData: "<language>en-us</language>",
  });
};
