/**
 * ============================================================================
 * Foreground static server for ./dist.
 *
 * WHY THIS EXISTS, because deleting it will quietly break CI.
 *
 * `astro preview` backgrounds itself whenever stdout is not a TTY, which is
 * exactly what it sees when Playwright spawns it or when anything runs on a CI
 * runner. The spawned process exits immediately, Playwright reports "Process
 * from config.webServer exited early", and the whole suite fails before a
 * single test runs. `--no-background` does not change it. Locally this never
 * showed up, because playwright.config.ts sets `reuseExistingServer` outside
 * CI and every run was quietly attaching to a preview server somebody had
 * already started by hand.
 *
 * So: a server that stays in the foreground, holds the terminal, and dies with
 * its parent. No dependencies, because the test harness should not be able to
 * break on a transitive update of a web server nobody chose.
 *
 * ---- IT MUST RESOLVE PATHS THE WAY PRODUCTION DOES ----
 * Cloudflare Workers static assets serves /contact from contact/index.html and
 * a miss from 404.html with a real 404 status. Both behaviours are asserted by
 * tests, so both are implemented here rather than approximated. A server that
 * 200s on a missing path would turn the 404 test green while production
 * shipped a Cloudflare default error page.
 * ========================================================================= */

import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { join, normalize, extname, resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const ROOT = resolve(flag("dir", "dist"));
const PORT = Number(flag("port", "4321"));
const HOST = flag("host", "127.0.0.1");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

/** A real file, or null. Directories are not files. */
const file = (p) => {
  try {
    return statSync(p).isFile() ? p : null;
  } catch {
    return null;
  }
};

/** Production's resolution order, in order. */
const resolvePath = (urlPath) => {
  // normalize collapses ".." before it is joined, so a traversal attempt
  // cannot escape ROOT even though this only ever serves a build output.
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  const base = join(ROOT, clean);
  if (clean.endsWith("/")) return file(join(base, "index.html"));
  return file(base) ?? file(join(base, "index.html")) ?? file(`${base}.html`);
};

const server = createServer((req, res) => {
  const hit = resolvePath(req.url ?? "/");
  const path = hit ?? join(ROOT, "404.html");
  const status = hit ? 200 : 404;
  const type = TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";

  res.writeHead(status, {
    "content-type": type,
    // Explicitly no caching. A stale asset between a rebuild and a test run is
    // a false pass, and every consumer of this server is a gate.
    "cache-control": "no-store",
  });
  if (req.method === "HEAD") return res.end();
  createReadStream(path).pipe(res);
});

server.listen(PORT, HOST, () => {
  // One line, on stdout, so a caller polling for readiness has something to
  // watch besides the port.
  console.log(`serving ${ROOT} at http://${HOST}:${PORT}`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
