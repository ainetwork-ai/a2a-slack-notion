/**
 * Playwright configuration for Notion integration E2E tests.
 *
 * Scope:
 *   - Chromium only (firefox/webkit omitted to keep the CI matrix small).
 *   - baseURL: http://localhost:3000 (Next.js dev server).
 *   - webServer: auto-starts `pnpm dev` on the base URL unless one is already running.
 *
 * Run:
 *   pnpm test:e2e        # headless
 *   pnpm test:e2e:ui     # interactive UI mode
 */

import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false, // keep serial while shared DB seed story is still TODO
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
