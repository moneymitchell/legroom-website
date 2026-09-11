// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// Static output. No adapter: Cloudflare Workers static assets serves ./dist
// directly, and the form handler is a separate Worker script (see worker/).
export default defineConfig({
  site: "https://legroomcompany.com",
  output: "static",
  trailingSlash: "ignore",
  build: { inlineStylesheets: "always" },
  vite: {
    plugins: [tailwindcss()],
    build: { cssMinify: "lightningcss" },
  },
  devToolbar: { enabled: false },
});
