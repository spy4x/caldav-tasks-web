/**
 * Href containment: which addresses the browser may name. The browser sends back hrefs the relay
 * listed; anything else must be refused before a request leaves the server, because the CalDAV
 * client sends the owner's credentials with every request.
 */

/** Longest href accepted, in characters. */
export const MAX_HREF_LENGTH = 2048

/**
 * The path of a CalDAV URL as the relay shows it to the browser: the pathname only, percent-encoded
 * the way the URL parser leaves it.
 */
export function hrefOf(url: string): string {
  return new URL(url).pathname
}

/**
 * Checks that `raw` is a plain, canonical absolute path on the CalDAV server and returns it, or
 * `null` when it is not. Refused: anything that is not a string, absolute URLs (another origin,
 * userinfo), protocol-relative `//host`, backslashes, a query or fragment, raw spaces, control or
 * non-ASCII characters, `.` and `..` segments written plainly or percent-encoded, and encoded
 * slashes or backslashes, which a server may decode into a path separator.
 */
export function canonicalPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_HREF_LENGTH) return null
  if (!raw.startsWith("/") || raw.startsWith("//")) return null
  // Printable ASCII only, without `\`, `?` and `#`: hrefs the relay lists are percent-encoded.
  if (!/^[\x21-\x7e]+$/.test(raw) || /[\\?#]/.test(raw)) return null
  let url: URL
  try {
    url = new URL(raw, "http://relay.invalid")
  } catch {
    return null
  }
  // The parser removes dot segments and decodes nothing else; a changed path had one.
  if (url.pathname !== raw || url.host !== "relay.invalid") return null
  for (const segment of raw.split("/")) {
    let decoded: string
    try {
      decoded = decodeURIComponent(segment)
    } catch {
      return null
    }
    if (decoded === "." || decoded === "..") return null
    if (decoded.includes("/") || decoded.includes("\\") || hasControl(decoded)) return null
  }
  return raw
}

/** Whether `text` holds a C0 control character or DEL. */
function hasControl(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

/**
 * The calendar a task href sits in: its path up to and including the last `/`. `null` when the
 * href ends with `/` (a collection, not a task).
 */
export function parentCalendar(objectPath: string): string | null {
  if (objectPath.endsWith("/")) return null
  return objectPath.slice(0, objectPath.lastIndexOf("/") + 1)
}
