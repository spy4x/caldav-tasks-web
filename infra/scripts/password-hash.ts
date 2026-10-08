/**
 * Prints the `OWNER_PASSWORD_HASH` for a password: `deno task password:hash`.
 *
 * The pepper comes from `AUTH_PEPPER` in the environment or `.env`, and must be the one the server
 * runs with. The password is read from standard input, never from an argument, so it stays out of
 * the shell history and the process list. At a terminal it is typed without echo; otherwise the
 * whole input is the password, without one trailing line break:
 *
 * ```sh
 * deno task password:hash                     # type it, then Enter
 * printf %s "$PASSWORD" | deno task password:hash
 * ```
 *
 * @module
 */
import { createPasswordHasher } from "@spy4x/server/sign-in"

/** The password in piped input: everything but one trailing `\n` or `\r\n`. */
export function passwordFromInput(text: string): string {
  return text.replace(/\r?\n$/, "")
}

/** The hash the server checks `password` against, under `pepper`. */
export function hashPassword(password: string, pepper: string): Promise<string> {
  return createPasswordHasher({ pepper }).hash(password)
}

/** Reads one line from the terminal without echoing it. Returns `null` on Ctrl-C or Ctrl-D. */
async function readHidden(): Promise<string | null> {
  const encoder = new TextEncoder()
  await Deno.stderr.write(encoder.encode("Password (not shown): "))
  Deno.stdin.setRaw(true)
  const bytes: number[] = []
  const buffer = new Uint8Array(64)
  try {
    while (true) {
      const read = await Deno.stdin.read(buffer)
      if (read === null) return null
      for (const byte of buffer.subarray(0, read)) {
        if (byte === 0x03 || byte === 0x04) return null
        if (byte === 0x0d || byte === 0x0a) return new TextDecoder().decode(new Uint8Array(bytes))
        if (byte === 0x7f || byte === 0x08) bytes.pop()
        else bytes.push(byte)
      }
    }
  } finally {
    buffer.fill(0)
    Deno.stdin.setRaw(false)
    await Deno.stderr.write(encoder.encode("\n"))
  }
}

async function main(): Promise<number> {
  const pepper = Deno.env.get("AUTH_PEPPER") ?? ""
  if (pepper.length < 32) {
    console.error("Set AUTH_PEPPER (at least 32 characters) in .env or the environment first.")
    return 1
  }
  const password = Deno.stdin.isTerminal()
    ? await readHidden()
    : passwordFromInput(await new Response(Deno.stdin.readable).text())
  if (!password) {
    console.error("No password given.")
    return 1
  }
  try {
    console.log(await hashPassword(password, pepper))
  } catch (error) {
    // The hasher's errors name the rule broken, never the password.
    console.error(error instanceof Error ? error.message : "Cannot hash this password.")
    return 1
  }
  return 0
}

if (import.meta.main) Deno.exit(await main())
