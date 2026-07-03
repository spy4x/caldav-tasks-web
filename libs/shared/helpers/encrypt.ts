// Simple AES-GCM encryption for storing server passwords at rest
// Uses a derived key from a master secret (not the auth pepper)

const encoder = new TextEncoder()

async function getKey(masterSecret: string, salt: Uint8Array): Promise<CryptoKey> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(masterSecret) as BufferSource,
    "PBKDF2",
    false,
    ["deriveKey"],
  )
  // deno-lint-ignore no-explicit-any
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as any, iterations: 100_000, hash: "SHA-256" },
    key,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}

export async function encrypt(plaintext: string, secret: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await getKey(secret, salt)
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext),
  )
  const ct = new Uint8Array(ciphertext)
  const toBase64 = (b: Uint8Array) =>
    btoa(Array.from(b).map((x) => String.fromCharCode(x)).join(""))
  return `${toBase64(salt)}:${toBase64(iv)}:${toBase64(ct)}`
}

export async function decrypt(
  encrypted: string,
  secret: string,
): Promise<string> {
  const parts = encrypted.split(":")
  const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
  const salt = fromBase64(parts[0])
  const iv = fromBase64(parts[1])
  const ct = fromBase64(parts[2])
  const key = await getKey(secret, salt)
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ct,
  )
  return new TextDecoder().decode(plain)
}
