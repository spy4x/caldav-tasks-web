/**
 * Starts the server under test with reminder notifications configured: the `webServer` command of
 * `playwright.config.ts`.
 *
 * No key pair is committed. Each start makes its own VAPID keys and its own folder for the
 * subscriptions, inside `data` because that is the one folder `deno task start` may write, then
 * runs `deno task start` with them on top of the environment Playwright gave it. When Playwright
 * stops it, it stops the server and removes the folder.
 *
 * @module
 */
import { generateVapidKeyPair } from "@spy4x/integrations/push"
import { vapidEnvLines } from "../infra/scripts/vapid-keys-create.ts"

const DATA = `data`

await Deno.mkdir(DATA, { recursive: true })
const folder = await Deno.makeTempDir({ dir: DATA, prefix: `e2e-` })
const keys = Object.fromEntries(
  vapidEnvLines(await generateVapidKeyPair(), `mailto:e2e@example.com`).map((line) => {
    const at = line.indexOf(`=`)
    return [line.slice(0, at), line.slice(at + 1)]
  }),
)

const server = new Deno.Command(`deno`, {
  args: [`task`, `start`],
  env: { ...keys, DATA_DIR: folder, REMINDER_TIME_ZONE: `UTC` },
  stdin: `null`,
}).spawn()

for (const signal of [`SIGTERM`, `SIGINT`] as const) {
  Deno.addSignalListener(signal, () => {
    try {
      server.kill(`SIGTERM`)
    } catch {
      // It has stopped already.
    }
  })
}

const { code } = await server.status
await Deno.remove(folder, { recursive: true })
Deno.exit(code)
