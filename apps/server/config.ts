import { ConfigError, type EnvReader, loadConfig, systemEnv } from "@spy4x/server/config"
import { isLoopbackRedirect } from "@spy4x/server/mcp-oauth"
import { isPasswordHash } from "@spy4x/server/sign-in"
import { isValidTimeZone } from "@spy4x/time/tz"
import { type } from "arktype"

/**
 * The environment the server needs. Every variable here is required: there are no fallbacks and no
 * development defaults, so a deployment that forgot one stops at start-up instead of running with
 * a guess. Development reads `.env`, copied from `.env.example`. Reminder notifications have their
 * own optional group: see {@link pushConfigSchema}.
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

const WEB_ADDRESS_REASON =
  "must be an http:// or https:// address with no username or password in it"

/** What is wrong with `value` as an address the server fetches or is opened at, or `null`. */
function webAddressProblem(value: string): string | null {
  const url = new URL(value)
  if (url.protocol !== "http:" && url.protocol !== "https:") return WEB_ADDRESS_REASON
  if (url.username !== "" || url.password !== "") return WEB_ADDRESS_REASON
  return null
}

/**
 * What is wrong with `value` as `PUBLIC_URL`, or `null`. The session cookie is always `Secure`, and
 * a browser keeps such a cookie over plain `http:` on its own machine only, so any other `http:`
 * address would start a server nobody can sign in to.
 */
function publicUrlProblem(value: string): string | null {
  const problem = webAddressProblem(value)
  if (problem) return problem
  const url = new URL(value)
  if (url.protocol === "https:" || isLoopbackRedirect(url)) return null
  return "must start with https://, because a browser keeps the sign-in cookie on https only; http:// works on localhost, 127.0.0.1 and [::1]"
}

/**
 * Reads and checks the environment. Throws a `ConfigError` naming every bad variable. A reason
 * never holds the value.
 */
export function readConfig(reader: EnvReader = systemEnv): Config {
  const config = loadConfig(configSchema, reader)
  const issues = [
    { name: "CALDAV_URL", reason: webAddressProblem(config.CALDAV_URL) },
    {
      name: "OWNER_PASSWORD_HASH",
      // A `.env` loader or a Compose file that expands `$` cuts the hash short, and every sign-in
      // would then answer "Wrong password".
      reason: isPasswordHash(config.OWNER_PASSWORD_HASH)
        ? null
        : "must be the whole output of `deno task password:hash`: in a .env file put it in single quotes, in a compose.yml write each $ as $$",
    },
    { name: "PUBLIC_URL", reason: publicUrlProblem(config.PUBLIC_URL) },
  ].flatMap(({ name, reason }) => (reason === null ? [] : [{ name, reason }]))
  if (issues.length > 0) throw new ConfigError(issues.map((issue) => issue.name), issues)
  return config
}

/**
 * The environment of reminder notifications (Web Push). The group is optional as a whole: with
 * none of the five set the feature is off, with all five set it is on, and anything in between
 * stops the server at start-up.
 */
export const pushConfigSchema = type({
  /** The VAPID public key, base64url: what `deno task vapid:keys` writes. */
  VAPID_PUBLIC_KEY: "string > 0",
  /** The VAPID private key, base64url. A secret. */
  VAPID_PRIVATE_KEY: "string > 0",
  /** How a push service can reach the owner: a `mailto:` or `https:` address. */
  VAPID_SUBJECT: /^(mailto:\S+@\S+|https:\/\/\S+)$/,
  /** The folder of the one file the server writes: the push subscriptions and what was sent. */
  DATA_DIR: "string > 0",
  /**
   * The IANA zone a reminder is read in when its task has a date with no time, or a time with no
   * zone. Such as `Europe/Berlin`.
   */
  REMINDER_TIME_ZONE: "string > 0",
})

/** The checked environment of reminder notifications. */
export type PushConfig = typeof pushConfigSchema.infer

/** The names of the push group, in the order `.env.example` lists them. */
export const PUSH_VARIABLES = [
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "DATA_DIR",
  "REMINDER_TIME_ZONE",
] as const satisfies readonly (keyof PushConfig)[]

/**
 * Reads the push group. `null` when none of its variables is set (a value that is empty or only
 * white space counts as unset): notifications are off. Throws a `ConfigError` naming every missing or bad variable when only
 * some are set, so half a setup never runs.
 */
export function readPushConfig(reader: EnvReader = systemEnv): PushConfig | null {
  const trimmed: EnvReader = { get: (name) => reader.get(name)?.trim() || undefined }
  if (PUSH_VARIABLES.every((name) => trimmed.get(name) === undefined)) return null
  const config = loadConfig(pushConfigSchema, trimmed)
  if (!isValidTimeZone(config.REMINDER_TIME_ZONE)) {
    throw pushConfigError("REMINDER_TIME_ZONE", "must be an IANA time zone, such as Europe/Berlin")
  }
  return config
}

/** A `ConfigError` for one variable of the push group. The reason never holds the value. */
export function pushConfigError(
  name: (typeof PUSH_VARIABLES)[number],
  reason: string,
): ConfigError {
  return new ConfigError([name], [{ name, reason }])
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
