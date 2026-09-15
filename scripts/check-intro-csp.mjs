/**
 * ============================================================================
 * The intro's build integration, and the single control that keeps it honest.
 *
 * Wired in from astro.config.mjs inside an INTRO fence, so it runs on every
 * `astro build`, which `npm run deploy` calls first. Nothing here is a step
 * anyone has to remember.
 *
 * TWO JOBS, DECIDED BY ONE FLAG.
 *
 *   INTRO=off astro build
 *
 * Every file outside the intro's own paths that the intro touched carries its
 * changes inside `INTRO: start` / `INTRO: end` fences. With the flag off, a
 * Vite `load` hook hands the compiler those files with the fences cut out, so
 * the compiler never sees a line of intro code, and `astro:build:done` deletes
 * dist/intro and then refuses to finish if any intro marker survives anywhere
 * in the output. The build is byte identical to tag `pre-intro-animation`, and
 * tests/intro.spec.ts proves that rather than assuming it. REMOVING-THE-INTRO.md
 * has the permanent version.
 *
 * Why `load` and not `transform`: Astro's own compiler plugin is `enforce: pre`
 * and registered ahead of anything an integration adds, so a transform here
 * would see compiled JavaScript, not .astro source. Its `load`, though, only
 * answers the `?astro&type=` sub requests it creates for styles and scripts,
 * and returns nothing for the file itself. That leaves the file to us.
 *
 *   astro build            (the default)
 *
 * The gate in Base.astro is an inline script, and the CSP in public/_headers
 * has `script-src 'self'` with no 'unsafe-inline'. So the gate is allowed by
 * hash, and a hash pins exact bytes: change one character and the browser
 * blocks it silently, no build error, no test failure, the intro just stops.
 * public/_headers is left EXACTLY as it is on main. This hook computes the
 * hash from the built HTML, writes it into dist/_headers along with the cache
 * rule for /intro/*, reads the file back and verifies it. The source of truth
 * for the hash is the output it protects.
 *
 * Adding a hash does not disable 'self' or the Cal and Turnstile origins. Only
 * 'strict-dynamic' would, and this policy does not use it. application/ld+json
 * blocks are skipped: CSP script-src governs scripts that execute.
 *
 * ALSO A COMMAND LINE TOOL.
 *
 *   node scripts/check-intro-csp.mjs                 verify dist/_headers
 *   node scripts/check-intro-csp.mjs --strip-fences  cut the fences out of the
 *                                                    source files, in place, for
 *                                                    permanent removal
 * ========================================================================= */

import { readFileSync, writeFileSync, readdirSync, statSync, rmSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Every file outside the intro's own paths that carries a fenced block. */
export const FENCED_FILES = [
  "astro.config.mjs",
  "src/layouts/Base.astro",
  "src/pages/index.astro",
  "playwright.config.ts",
];

/** The intro's own paths, for Tailwind's scanner. Relative to global.css. */
const GLOBAL_CSS = join(root, "src", "styles", "global.css");
const TAILWIND_EXCLUDES = [
  "../components/Intro.astro",
  "../scripts/intro",
  "../../scripts/build-intro-assets.mjs",
  "../../scripts/check-intro-csp.mjs",
  "../../tests/intro.spec.ts",
  "../../REMOVING-THE-INTRO.md",
  "../../public/intro",
]
  .map((p) => `@source not "${p}";`)
  .join("\n");

/** Strings that must not appear anywhere in an INTRO=off build. */
const MARKERS = ["data-intro", "lg.intro.seen", "__legroomIntro", "/intro/", "intro-overlay"];

/**
 * Removes every line from one containing `INTRO: start` through one containing
 * `INTRO: end`, inclusive. Whole lines, so the fence comment and the code it
 * fences leave together and what is left is the file as it was.
 */
export function stripFences(text) {
  const out = [];
  let inside = false;
  let blocks = 0;
  for (const line of text.split("\n")) {
    if (line.includes("INTRO: start")) {
      inside = true;
      blocks++;
      continue;
    }
    if (line.includes("INTRO: end")) {
      inside = false;
      continue;
    }
    if (!inside) out.push(line);
  }
  return { code: out.join("\n"), blocks };
}

/* --- the CSP hash --------------------------------------------------------- */

const SCRIPT_RE = /<script([^>]*)>([\s\S]*?)<\/script>/gi;

/** sha256 of every executable inline script in one HTML file. */
export function inlineScriptHashes(html) {
  const hashes = [];
  for (const m of html.matchAll(SCRIPT_RE)) {
    const attrs = m[1];
    const body = m[2];
    if (/\ssrc\s*=/i.test(attrs)) continue;
    const type = /\stype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase();
    if (type && !/^(module|text\/javascript|application\/javascript)$/.test(type)) continue;
    if (body.trim() === "") continue;
    hashes.push("sha256-" + createHash("sha256").update(body, "utf8").digest("base64"));
  }
  return hashes;
}

const walk = (dir, acc = []) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
};

/**
 * The gate carries a __INTRO_CHUNK__ placeholder for a modulepreload of the
 * intro's own chunk, whose hashed name exists only after bundling. This writes
 * the real path in. It runs BEFORE the hash is taken, which is the whole point
 * of hashing the output rather than the source.
 */
export function fillChunkPath(dist) {
  const chunk = readdirSync(join(dist, "_astro")).find((f) => /^intro\.[\w-]+\.js$/.test(f));
  if (!chunk) throw new Error("intro: no intro.*.js chunk in dist/_astro. Was the dynamic import stripped?");
  const path = join(dist, "index.html");
  const html = readFileSync(path, "utf8");
  if (!html.includes("__INTRO_CHUNK__")) throw new Error("intro: the gate has no __INTRO_CHUNK__ placeholder");
  writeFileSync(path, html.replaceAll("__INTRO_CHUNK__", `/_astro/${chunk}`));
  return `/_astro/${chunk}`;
}

/** Writes the hash and the cache rule into dist/_headers. Idempotent. */
export function injectHeaders(dist) {
  const html = readFileSync(join(dist, "index.html"), "utf8");
  const hashes = inlineScriptHashes(html);
  if (hashes.length !== 1) {
    throw new Error(
      `intro: expected exactly one inline script on the homepage (the gate), found ${hashes.length}`,
    );
  }
  const hash = hashes[0];
  const path = join(dist, "_headers");
  let text = readFileSync(path, "utf8");

  // Operate on the POLICY LINE and nothing else. The comment paragraph above
  // it also contains the words "script-src", and a pattern that matched there
  // with [^;] running across newlines once replaced the whole top of the file
  // up to the first semicolon in the real policy. Same file, mangled, and the
  // guard that followed correctly refused it.
  const lines = text.split("\n");
  const at = lines.findIndex((l) => /^\s*Content-Security-Policy:/.test(l));
  if (at < 0) throw new Error("intro: no Content-Security-Policy line in _headers");
  const line = lines[at];
  const scriptSrc = /script-src ([^;\n]+);/.exec(line);
  if (!scriptSrc) throw new Error("intro: no script-src directive on the policy line");
  const tokens = scriptSrc[1].trim().split(/\s+/).filter((t) => !/^'sha256-/.test(t));
  lines[at] = line.replace(scriptSrc[0], `script-src ${[...tokens, `'${hash}'`].join(" ")};`);
  text = lines.join("\n");

  const rule = `\n# The intro plates and atlas. Injected at build by scripts/check-intro-csp.mjs.\n/intro/*\n  Cache-Control: public, max-age=604800\n`;
  if (!text.includes("/intro/*")) {
    const anchor = "/photos/*\n  Cache-Control: public, max-age=604800\n";
    if (!text.includes(anchor)) throw new Error("intro: could not find the /photos/* rule to anchor on");
    text = text.replace(anchor, anchor + rule);
  }
  writeFileSync(path, text);
  return hash;
}

/** Reads dist back and confirms the served policy allows the served gate. */
export function verifyHeaders(dist) {
  const html = readFileSync(join(dist, "index.html"), "utf8");
  const headers = readFileSync(join(dist, "_headers"), "utf8");
  const csp = headers.split("\n").find((l) => /^\s*Content-Security-Policy:/.test(l)) ?? "";
  const declared = new Set([...csp.matchAll(/'(sha256-[A-Za-z0-9+/=]+)'/g)].map((m) => m[1]));
  const found = inlineScriptHashes(html);
  const missing = found.filter((h) => !declared.has(h));
  const stale = [...declared].filter((h) => !found.includes(h));
  if (missing.length || stale.length) {
    throw new Error(
      `intro: dist/_headers does not match dist/index.html.\n` +
        (missing.length ? `  not allowed: ${missing.join(", ")}\n` : "") +
        (stale.length ? `  allowed but shipped by nothing: ${stale.join(", ")}\n` : "") +
        `  Rebuild. The hash is written by the build itself.`,
    );
  }
  if (!headers.includes("/intro/*")) throw new Error("intro: dist/_headers has no /intro/* cache rule");
  return found[0];
}

/** For INTRO=off: nothing intro shaped may survive in the output. */
export function assertClean(dist) {
  const hits = [];
  for (const f of walk(dist)) {
    if (!/\.(html|js|css|xml|txt)$/.test(f)) continue;
    const text = readFileSync(f, "utf8");
    for (const m of MARKERS) if (text.includes(m)) hits.push(`${f.replace(dist, "dist")}: "${m}"`);
  }
  if (existsSync(join(dist, "intro"))) hits.push("dist/intro/ still exists");
  if (hits.length) throw new Error(`intro: INTRO=off build still contains intro code:\n  ${hits.join("\n  ")}`);
}

/* --- the Astro integration ------------------------------------------------ */

export function intro() {
  const on = process.env.INTRO !== "off";
  return {
    name: "legroom-intro",
    hooks: {
      "astro:config:setup": ({ updateConfig, logger }) => {
        if (!on) logger.info("INTRO=off: fenced blocks are being cut before compile");
        updateConfig({
          vite: {
            plugins: [
              {
                name: "legroom-intro",
                enforce: "pre",
                load(id) {
                  const file = id.split("?")[0];
                  if (!file.startsWith(root)) return null;
                  // Tailwind v4 scans EVERY text file in the project for
                  // class shaped tokens, imported or not. `easing: "ease-out"`
                  // in a module nobody imports still ships `.ease-out` to
                  // every visitor, and made an INTRO=off build differ from the
                  // tag by five CSS rules. The intro uses no utilities, so its
                  // paths are excluded from the scan, in both modes, here
                  // rather than in global.css, which stays as it is on main.
                  if (file === GLOBAL_CSS) {
                    return { code: readFileSync(file, "utf8") + "\n" + TAILWIND_EXCLUDES, map: null };
                  }
                  if (on) return null;
                  if (!/\.(astro|ts|mjs|js)$/.test(file)) return null;
                  let text;
                  try {
                    text = readFileSync(file, "utf8");
                  } catch {
                    return null;
                  }
                  if (!text.includes("INTRO: start")) return null;
                  return { code: stripFences(text).code, map: null };
                },
              },
            ],
          },
        });
      },
      "astro:build:done": ({ dir, logger }) => {
        const dist = fileURLToPath(dir);
        if (!on) {
          rmSync(join(dist, "intro"), { recursive: true, force: true });
          assertClean(dist);
          logger.info("INTRO=off: dist/intro removed, no intro markers in the output");
          return;
        }
        const chunk = fillChunkPath(dist);
        const hash = injectHeaders(dist);
        verifyHeaders(dist);
        logger.info(`gate preloads ${chunk}, allowed by '${hash.slice(0, 20)}...', /intro/* cache rule in place`);
      },
    },
  };
}

/* --- command line --------------------------------------------------------- */

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  if (process.argv.includes("--strip-fences")) {
    for (const rel of FENCED_FILES) {
      const path = join(root, rel);
      const { code, blocks } = stripFences(readFileSync(path, "utf8"));
      writeFileSync(path, code);
      console.log(`  ${rel}: ${blocks} block(s) removed`);
    }
    console.log("\n  fences stripped. Now delete the intro paths, see REMOVING-THE-INTRO.md\n");
  } else {
    try {
      const hash = verifyHeaders(join(root, "dist"));
      console.log(`  intro CSP guard: gate hashed in dist/_headers ('${hash.slice(0, 20)}...'). OK`);
    } catch (e) {
      console.error(`\n  CSP HASH GUARD FAILED\n\n  ${e.message}\n`);
      process.exit(1);
    }
  }
}
