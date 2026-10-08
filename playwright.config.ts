import { defineConfig, devices } from "@playwright/test"
import { APP_URL, serverEnv } from "./e2e/env.ts"

/**
 * End-to-end tests. They run against the built app (`deno task build`) served by the real server,
 * with a Radicale at RADICALE_URL (default http://localhost:5232, `deno task radicale:up`).
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.e2e\.ts/,
  outputDir: "./e2e/results",
  // Fail the build on CI if a `test.only` was left in the source.
  forbidOnly: !!Deno.env.get("CI"),
  retries: Deno.env.get("CI") ? 2 : 0,
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: APP_URL,
    // Hooks are `data-e2e`, as in the other spy4x apps; `getByTestId` reads them.
    testIdAttribute: "data-e2e",
    actionTimeout: 10_000,
    navigationTimeout: 10_000,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "deno task start",
    url: `${APP_URL}/health`,
    env: serverEnv(),
    // A server left running by hand would hide a broken start, so CI never reuses one.
    reuseExistingServer: !Deno.env.get("CI"),
    timeout: 60_000,
  },
})
