import rss from "@astrojs/rss";

import { getPapers, paperDate, paperHref } from "../lib/papers";

export async function GET(context: { site?: URL }) {
  const papers = await getPapers();

  return rss({
    title: "DeepGeno Watch",
    description:
      "Human-approved reading for computational genomics, sequence-to-function models, and genomic language models.",
    site: context.site ?? new URL("https://deepgeno.watch"),
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
}
