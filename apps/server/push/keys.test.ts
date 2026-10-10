/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { generateVapidKeyPair, vapidPublicKey } from "@spy4x/integrations/push"
import { ConfigError, describeConfigError } from "../config.ts"
import { vapidKeysFromText } from "./keys.ts"

/** A throwaway pair in the two texts the environment holds. Never printed. */
async function freshPair(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = await generateVapidKeyPair()
  return { publicKey: pair.publicKey, privateKey: pair.keys.privateKey.d ?? "" }
}

async function refusal(publicKey: string, privateKey: string): Promise<ConfigError> {
  try {
    await vapidKeysFromText(publicKey, privateKey)
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError)
    return error as ConfigError
  }
  throw new Error("the keys were accepted")
}

Deno.test("reads the two key texts into keys the sender serves the same public key from", async () => {
  const { publicKey, privateKey } = await freshPair()
  const keys = await vapidKeysFromText(` ${publicKey}\n`, privateKey)
  expect(await vapidPublicKey(keys)).toBe(publicKey)
})

Deno.test("names the key whose text has another shape, without the text", async () => {
  const { publicKey, privateKey } = await freshPair()
  const cases: [string, string, string][] = [
    ["not base64url!", privateKey, "VAPID_PUBLIC_KEY"],
    [privateKey, privateKey, "VAPID_PUBLIC_KEY"],
    // The first byte is no longer the marker of an uncompressed point.
    [`A${publicKey.slice(1)}`, privateKey, "VAPID_PUBLIC_KEY"],
    [publicKey, "not base64url!", "VAPID_PRIVATE_KEY"],
    [publicKey, publicKey, "VAPID_PRIVATE_KEY"],
  ]
  for (const [publicText, privateText, name] of cases) {
    const error = await refusal(publicText, privateText)
    expect(error.variables).toEqual([name])
    const message = describeConfigError(error)
    expect(message).not.toContain(publicKey)
    expect(message).not.toContain(privateKey)
  }
})

Deno.test("refuses a private key that belongs to another public key", async () => {
  const one = await freshPair()
  const other = await freshPair()
  const error = await refusal(one.publicKey, other.privateKey)
  expect(error.variables).toEqual(["VAPID_PRIVATE_KEY"])
  expect(describeConfigError(error)).toContain("does not belong to VAPID_PUBLIC_KEY")
  expect(describeConfigError(error)).not.toContain(other.privateKey)
})
