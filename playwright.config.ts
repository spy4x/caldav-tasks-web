import { defineConfig, devices } from "@playwright/test"
// The npm name of `@spy4x/preact-system`: Playwright loads this file itself and finds only
// packages in `node_modules`, where a `jsr:` import puts nothing.
import { playwrightBaseConfig } from "@jsr/spy4x__preact-system/playwright"
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
    // Starts `deno task start` with throwaway push keys and a temporary data folder.
    command:
      "deno run --no-prompt --allow-env --allow-run=deno --allow-read=data --allow-write=data e2e/server.ts",
    url: `${APP_URL}/health`,
    env: serverEnv(),
    // A server left running by hand would hide a broken start, so CI never reuses one.
    reuseExistingServer: !Deno.env.get("CI"),
    timeout: 60_000,
    // The default is SIGKILL, which would leave the server running and its data folder behind.
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
  },
})
