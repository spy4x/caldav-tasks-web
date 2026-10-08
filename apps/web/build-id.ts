/** A short hash of the files, by path and content, so any change to a shipped file changes it. */
export async function buildIdOf(files: Map<string, Uint8Array>): Promise<string> {
  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  for (const path of [...files.keys()].sort()) {
    parts.push(encoder.encode(`${path}\0`), files.get(path)!, encoder.encode(`\0`))
  }
  const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    joined.set(part, offset)
    offset += part.length
  }
  const digest = new Uint8Array(await crypto.subtle.digest(`SHA-256`, joined))
  return [...digest.slice(0, 6)].map((byte) => byte.toString(16).padStart(2, `0`)).join(``)
}
