import { createApp } from "./app.ts"
import { ConfigError, describeConfigError, readConfig } from "./config.ts"

// Run with `deno serve`: the default export below is the server.
let app: Awaited<ReturnType<typeof createApp>>
try {
  app = await createApp(readConfig())
} catch (error) {
  if (!(error instanceof ConfigError)) throw error
  console.error(describeConfigError(error))
  Deno.exit(1)
}

export default { fetch: app.fetch }
