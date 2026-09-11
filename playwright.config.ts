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
  webServer: {
    command: "npm run preview -- --port 4321 --host 127.0.0.1",
    url: "http://127.0.0.1:4321",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
