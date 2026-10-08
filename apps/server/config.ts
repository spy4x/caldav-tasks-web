import { ConfigError, type EnvReader, loadConfig, systemEnv } from "@spy4x/server/config"
import { type } from "arktype"

/**
 * The environment the server needs. Every variable is required: there are no fallbacks and no
 * development defaults, so a deployment that forgot one stops at start-up instead of running with
 * a guess. Development reads `.env`, copied from `.env.example`.
 */
export const configSchema = type({
  /** The address people open the app at, e.g. `https://todos.example.com`. */
  PUBLIC_URL: "string.url",
  /** The CalDAV server's public address. Credentials are sent to this origin only. */
  CALDAV_URL: "string.url",
  CALDAV_USERNAME: "string > 0",
  CALDAV_PASSWORD: "string > 0",
  /** The owner's password hash, printed by `deno task password:hash`. */
  OWNER_PASSWORD_HASH: "string > 0",
  /** Key for the password hasher: at least 32 characters. */
  AUTH_PEPPER: "string >= 32",
  /** Signs the session cookie: at least 32 characters. Changing it signs everyone out. */
  SESSION_SECRET: "string >= 32",
})

/** The checked configuration. */
export type Config = typeof configSchema.infer

/** Reads and checks the environment. Throws a `ConfigError` naming every bad variable. */
export function readConfig(reader: EnvReader = systemEnv): Config {
  return loadConfig(configSchema, reader)
}

/**
 * The message printed when the environment is wrong: one line per variable, with the reason and
 * never the value.
 */
export function describeConfigError(error: ConfigError): string {
  const lines = error.issues.map((issue) => `  ${issue.name} ${issue.reason}`)
  return [`Cannot start: fix these environment variables (see .env.example).`, ...lines].join("\n")
}

export { ConfigError }
