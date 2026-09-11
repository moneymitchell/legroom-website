import type { APIRoute } from "astro";
import { site } from "@/content/site";

/** Two indexable pages. /thanks is excluded: it is noindex. */
const pages = [
  { path: "/", changefreq: "monthly", priority: "1.0" },
  { path: "/contact", changefreq: "yearly", priority: "0.5" },
];

export const GET: APIRoute = () => {
  const now = new Date().toISOString().slice(0, 10);
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    pages
      .map(
        (p) =>
          `  <url>\n    <loc>${site.meta.url}${p.path}</loc>\n` +
          `    <lastmod>${now}</lastmod>\n` +
          `    <changefreq>${p.changefreq}</changefreq>\n` +
          `    <priority>${p.priority}</priority>\n  </url>`,
      )
      .join("\n") +
    `\n</urlset>\n`;
  return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8" } });
};
