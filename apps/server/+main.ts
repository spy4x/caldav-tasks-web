import { shutdownSignal } from "@spy4x/platform/server/shutdown-signal"
import { createApp } from "./app.ts"
import { ConfigError, describeConfigError, readConfig, readPushConfig } from "./config.ts"
import { createPush, type PushRuntime, PushStateError } from "./push/start.ts"

// Run with `deno serve`: the default export below is the server.
let app: Awaited<ReturnType<typeof createApp>>
let reminders: PushRuntime | null = null
try {
  const config = readConfig()
  // Reminder notifications are on only when the whole push group is set.
  const pushConfig = readPushConfig()
  if (pushConfig) {
    try {
      reminders = await createPush(config, pushConfig)
    } catch (error) {
      // A broken data folder must not take the tasks down with it: say so once and go on.
      if (!(error instanceof PushStateError)) throw error
      console.error(`push: notifications are off: ${error.message}`)
    }
  }
  app = await createApp(config, { push: reminders?.push })
} catch (error) {
  if (!(error instanceof ConfigError)) throw error
  console.error(describeConfigError(error))
  Deno.exit(1)
}

if (reminders) {
  const { runner } = reminders
  runner.start()
  // A container stop: let the tick in flight save what it sent, then leave.
  shutdownSignal().addEventListener("abort", () => {
    void runner.stop().finally(() => Deno.exit(0))
  })
}

export default { fetch: app.fetch }
