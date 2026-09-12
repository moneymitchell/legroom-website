import { defineConfig, devices } from "@playwright/test";

/**
 * Tests run against the real production build, served statically. Never against
 * the dev server: dev injects HMR client code and unminified CSS, so a pass
 * there proves nothing about what ships.
 */
export default defineConfig({
  testDir: "./tests",
  /* stable names: no {platform} suffix, so the handoff PNGs can be dropped in
     as baselines directly. */
  snapshotPathTemplate: "tests/__screenshots__/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:4321",
    trace: "retain-on-failure",
    // deterministic rendering for pixel comparison
    launchOptions: { args: ["--hide-scrollbars", "--force-color-profile=srgb"] },
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  /**
   * `npm run serve`, NOT `astro preview`. Astro's preview server backgrounds
   * itself the moment stdout is not a TTY, which is what it sees when
   * Playwright spawns it and on every CI runner: the spawned process exits at
   * once and Playwright reports "Process from config.webServer exited early"
   * before a single test runs. It never showed up locally, because
   * reuseExistingServer meant every local run silently attached to a preview
   * somebody had already started by hand. See scripts/serve-dist.mjs.
   */
  webServer: {
    command: "npm run serve -- --port 4321 --host 127.0.0.1",
    url: "http://127.0.0.1:4321",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
