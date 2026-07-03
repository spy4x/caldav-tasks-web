// PBKDF2 hashing — same approach as Financy
const ITERATIONS = 100_000
const KEY_LENGTH = 32

export async function hash(password: string, pepper: string): Promise<string> {
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password + pepper) as BufferSource,
    "PBKDF2",
    false,
    ["deriveBits"],
  )
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2" as any, salt: salt as any, iterations: ITERATIONS, hash: "SHA-256" as any },
    key,
    KEY_LENGTH * 8,
  )
  const derivedKey = new Uint8Array(derivedBits)
  const toHex = (b: Uint8Array) =>
    Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("")
  return `${toHex(salt)}:${toHex(derivedKey)}`
}

export async function checkHash(
  password: string,
  hashed: string,
  pepper: string,
): Promise<boolean> {
  const [saltHex, storedHash] = hashed.split(":")
  const salt = new Uint8Array(
    saltHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)),
  )
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password + pepper) as BufferSource,
    "PBKDF2",
    false,
    ["deriveBits"],
  )
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2" as any, salt: salt as any, iterations: ITERATIONS, hash: "SHA-256" as any },
    key,
    KEY_LENGTH * 8,
  )
  const derivedKey = new Uint8Array(derivedBits)
  const computed = Array.from(derivedKey)
    .map((b) => b.toString(16).padStart(2, "0")).join("")
  return computed === storedHash
}
