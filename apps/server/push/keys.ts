import { decodeBase64Url, encodeBase64Url } from "@std/encoding/base64url"
import type { VapidKeys } from "@spy4x/integrations/push"
import { pushConfigError } from "../config.ts"

/** An uncompressed P-256 point: the marker byte `0x04`, then `x` and `y` of 32 bytes each. */
const POINT_BYTES = 65
const SCALAR_BYTES = 32

/** The bytes of a base64url value, or `null` when it is not base64url. */
function bytes(text: string): Uint8Array | null {
  try {
    return decodeBase64Url(text.trim())
  } catch {
    return null
  }
}

/** Whether the private key signs what the public key verifies: one pair, not two halves. */
async function isPair(keys: VapidKeys): Promise<boolean> {
  const algorithm = { name: "ECDSA", namedCurve: "P-256" }
  const signing = { name: "ECDSA", hash: "SHA-256" }
  const probe = new TextEncoder().encode("vapid")
  try {
    const [privateKey, publicKey] = await Promise.all([
      crypto.subtle.importKey("jwk", keys.privateKey, algorithm, false, ["sign"]),
      crypto.subtle.importKey("jwk", keys.publicKey, algorithm, false, ["verify"]),
    ])
    const signature = await crypto.subtle.sign(signing, privateKey, probe)
    return await crypto.subtle.verify(signing, publicKey, signature, probe)
  } catch {
    // An unusable key reads the same as a wrong one; the cause could carry key material.
    return false
  }
}

/**
 * The VAPID keys of the environment as the two JWKs the push sender takes. The environment holds
 * them the way every Web Push tool prints them: the public key as the base64url of the 65-byte
 * point a browser subscribes with, the private key as the base64url of its 32-byte number.
 *
 * @throws {ConfigError} naming the variable whose value has another shape, or the private key when
 * it belongs to another public key. Never a value.
 */
export async function vapidKeysFromText(publicKey: string, privateKey: string): Promise<VapidKeys> {
  const point = bytes(publicKey)
  if (point === null || point.length !== POINT_BYTES || point[0] !== 4) {
    throw pushConfigError(
      "VAPID_PUBLIC_KEY",
      "must be the public key `deno task vapid:keys` prints",
    )
  }
  const scalar = bytes(privateKey)
  if (scalar === null || scalar.length !== SCALAR_BYTES) {
    throw pushConfigError(
      "VAPID_PRIVATE_KEY",
      "must be the private key `deno task vapid:keys` prints",
    )
  }
  const publicJwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: encodeBase64Url(point.slice(1, 1 + SCALAR_BYTES)),
    y: encodeBase64Url(point.slice(1 + SCALAR_BYTES)),
    ext: true,
    key_ops: ["verify"],
  }
  const keys: VapidKeys = {
    publicKey: publicJwk,
    privateKey: { ...publicJwk, d: encodeBase64Url(scalar), key_ops: ["sign"] },
  }
  if (!await isPair(keys)) {
    throw pushConfigError("VAPID_PRIVATE_KEY", "does not belong to VAPID_PUBLIC_KEY")
  }
  return keys
}
