/**
 * Creates the VAPID keys reminder notifications need: `deno task vapid:keys <contact>`.
 *
 * `<contact>` is how a push service can reach you, a `mailto:` or `https:` address. The script
 * writes three lines into `.env`: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`.
 * With `--print` it prints them and writes nothing, for a deployment that keeps its environment
 * elsewhere. It refuses to replace keys that `.env` already holds unless `--force` is given: new
 * keys end every device's subscription, and each device subscribes again the next time the app is
 * opened on it.
 *
 * ```sh
 * deno task vapid:keys mailto:me@example.com
 * deno task vapid:keys mailto:me@example.com --print
 * ```
 *
 * The private key is a secret: it is printed only with `--print`.
 *
 * @module
 */
import { generateVapidKeyPair, type VapidKeyPair } from "@spy4x/integrations/push"

const ENV_PATH = ".env"
const NAMES = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] as const

/** Whether `text` is a contact a push service accepts: a `mailto:` or `https:` address. */
export function isContact(text: string): boolean {
  return /^(mailto:\S+@\S+|https:\/\/\S+)$/.test(text)
}

/**
 * The three `.env` lines of a key pair, in the format the server reads: the public key as the
 * browser takes it, and the private key as its number alone, both base64url.
 */
export function vapidEnvLines(pair: VapidKeyPair, subject: string): string[] {
  const { d } = pair.keys.privateKey
  if (!d) throw new Error("The generated key pair has no private key")
  return [
    `VAPID_PUBLIC_KEY=${pair.publicKey}`,
    `VAPID_PRIVATE_KEY=${d}`,
    `VAPID_SUBJECT=${subject}`,
  ]
}

/** Whether `.env` text already sets a VAPID key to a value. */
export function hasVapidKeys(env: string): boolean {
  return /^VAPID_(PUBLIC|PRIVATE)_KEY=.+$/m.test(env)
}

/** `env` with the three lines set: each replaces its own line where there is one, or is added. */
export function withVapidLines(env: string, lines: readonly string[]): string {
  const kept = env.split("\n").filter((line) => !NAMES.some((name) => line.startsWith(`${name}=`)))
  while (kept.length > 0 && kept[kept.length - 1] === "") kept.pop()
  return [...kept, ...(kept.length > 0 ? [""] : []), ...lines, ""].join("\n")
}

async function main(args: string[]): Promise<number> {
  const flags = new Set(args.filter((arg) => arg.startsWith("--")))
  const [subject] = args.filter((arg) => !arg.startsWith("--"))
  if (!subject || !isContact(subject)) {
    console.error("Give a contact: deno task vapid:keys mailto:you@example.com [--print] [--force]")
    return 1
  }
  if (flags.has("--print")) {
    console.log(vapidEnvLines(await generateVapidKeyPair(), subject).join("\n"))
    return 0
  }
  let env = ""
  try {
    env = await Deno.readTextFile(ENV_PATH)
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error
  }
  if (hasVapidKeys(env) && !flags.has("--force")) {
    console.error(
      `${ENV_PATH} already holds VAPID keys. New keys end every device's subscription; pass --force to replace them.`,
    )
    return 1
  }
  await Deno.writeTextFile(
    ENV_PATH,
    withVapidLines(env, vapidEnvLines(await generateVapidKeyPair(), subject)),
    { mode: 0o600 },
  )
  console.log(`VAPID keys written to ${ENV_PATH}. Set DATA_DIR and REMINDER_TIME_ZONE beside them.`)
  return 0
}

if (import.meta.main) Deno.exit(await main(Deno.args))
