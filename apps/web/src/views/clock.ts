/** The IANA zone the person reads times in: the browser's. */
export function browserZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || `UTC`
}
