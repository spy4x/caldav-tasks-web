/** The IANA zone the person reads times in: the browser's. */
export function browserZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || `UTC`
}

/** Today's date in `zone` as `YYYY-MM-DD`. */
export function todayIn(zone: string, now = new Date()): string {
  return new Intl.DateTimeFormat(`en-CA`, { timeZone: zone }).format(now)
}
