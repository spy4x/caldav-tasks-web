// Secure random string — same approach as Financy
export function getRandomString(length = 20): string {
  const values = new Uint8Array(length)
  crypto.getRandomValues(values)
  return Array.from(values)
    .map((x) => (x % 36).toString(36))
    .join("")
}
