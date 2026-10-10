import { defineConfig, devices } from "@playwright/test"
import { playwrightBaseConfig } from "@spy4x/preact-system/playwright"
import { APP_URL, serverEnv } from "./e2e/env.ts"

/**
 * End-to-end tests. They run against the built app (`deno task build`) served by the real server,
 * with a Radicale at RADICALE_URL (default http://localhost:5232, `deno task radicale:up`).
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  ...playwrightBaseConfig({
    baseURL: APP_URL,
    ci: !!Deno.env.get("CI"),
    chromium: devices["Desktop Chrome"],
  }),
  webServer: {
    command: "deno task start",
    url: `${APP_URL}/health`,
    env: serverEnv(),
    // A server left running by hand would hide a broken start, so CI never reuses one.
    reuseExistingServer: !Deno.env.get("CI"),
    timeout: 60_000,
  },
})
