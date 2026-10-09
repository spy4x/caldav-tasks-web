import { signal } from "@preact/signals"
import type { CachedCalendar } from "./db.ts"

/**
 * The lists (CalDAV calendars) as last read: from the cache at start, then from the server after
 * every refresh. Empty until {@link loadCache} in `sync.ts` has run.
 */
export const calendars = signal<CachedCalendar[]>([])

/** Whether the cache has been read yet, so a screen can tell "no lists" from "not loaded". */
export const calendarsLoaded = signal(false)

/** The list with this `href`, if the cache has it. */
export function findCalendar(href: string): CachedCalendar | undefined {
  return calendars.value.find((calendar) => calendar.href === href)
}
