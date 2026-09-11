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
    // NOT lightningcss. It folds `animation-timeline: --deck` into the
    // `animation` shorthand, which cannot carry a timeline name, so the
    // declaration becomes invalid and the founder-deck dots silently stop
    // animating. Same failure as the missing timeline-scope, different cause.
    build: { cssMinify: "esbuild" },
  },
  devToolbar: { enabled: false },
});
