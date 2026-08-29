import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) => {
  if (!site) {
    throw new Error(
      "Astro's site URL must be configured before generating robots.txt.",
    );
  }

  const sitemap = new URL("sitemap-index.xml", site);
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${sitemap.href}\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
};
