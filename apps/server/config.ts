import { isLoopbackHost, parseIp } from "@spy4x/net/ip"
import { isLocalHostname, isPublicAddress } from "@spy4x/net/url-policy"
import { ConfigError, type EnvReader, loadConfig, systemEnv } from "@spy4x/server/config"
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
  /**
   * The CalDAV server's address. Credentials are sent to this origin only, so it is `https:`, or
   * `http:` at a host that is not public: see {@link isPrivateHost}.
   */
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
  if (url.protocol === "https:" || isLoopbackHost(url.hostname)) return null
  return "must start with https://, because a browser keeps the sign-in cookie on https only; http:// works on this machine's own names only, such as localhost and 127.0.0.1"
}

/**
 * True when `hostname`, as a `URL` gives it, is not a public address: this machine, a name with no
 * dot in it (a container on the same Docker network), a name under `.local` or `.internal`, or an
 * IP address that is not routable on the internet. Nothing is looked up: a name with a public
 * ending counts as public, wherever it points.
 */
export function isPrivateHost(hostname: string): boolean {
  if (isLoopbackHost(hostname) || isLocalHostname(hostname)) return true
  const address = hostname.replace(/^\[|\]$/g, "")
  if (parseIp(address) !== null) return !isPublicAddress(address)
  const name = hostname.replace(/\.$/, "").toLowerCase()
  return !name.includes(".") || name.endsWith(".internal")
}

/**
 * What is wrong with `value` as `CALDAV_URL`, or `null`. Every request carries the CalDAV password,
 * and plain `http:` sends it unencrypted, so `http:` is accepted only where the traffic stays on
 * this machine or a private network.
 */
function caldavUrlProblem(value: string): string | null {
  const problem = webAddressProblem(value)
  if (problem) return problem
  const url = new URL(value)
  if (url.protocol === "https:" || isPrivateHost(url.hostname)) return null
  return "must start with https://, because http:// would send the CalDAV password unencrypted over the internet; http:// works only for an address that is not public: a container name, this machine, or a private network address such as 192.168.1.10"
}

/**
 * What is wrong with `value` as `OWNER_PASSWORD_HASH`, or `null`. A `.env` loader or a Compose file
 * that expands `$` cuts the hash short, and a loader that does not read quotes (`docker run
 * --env-file`) leaves them in the value. Either way every sign-in would answer "Wrong password".
 */
function ownerPasswordHashProblem(value: string): string | null {
  if (isPasswordHash(value)) return null
  if (/^(['"]).*\1$/s.test(value)) {
    return "has quotes around it that were not removed: `docker run --env-file` keeps them, so write the hash there without quotes"
  }
  return "must be the whole output of `deno task password:hash`: in a .env file that Deno loads put it in single quotes, in a compose.yml write each $ as $$"
}

/**
 * Reads and checks the environment. Throws a `ConfigError` naming every bad variable; the checks of
 * an address's kind and of the hash run once nothing is missing. A reason never holds the value.
 */
export function readConfig(reader: EnvReader = systemEnv): Config {
  const config = loadConfig(configSchema, reader)
  const issues = [
    { name: "CALDAV_URL", reason: caldavUrlProblem(config.CALDAV_URL) },
    { name: "OWNER_PASSWORD_HASH", reason: ownerPasswordHashProblem(config.OWNER_PASSWORD_HASH) },
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
