import { signal } from "@preact/signals"
import { watchPageResume } from "@spy4x/realtime/page-lifecycle"
import { CALDAV_PATHS, calendarListSchema, objectListSchema } from "@api/caldav.ts"
import { connection, relay } from "./connection.ts"
import { calendars, calendarsLoaded } from "./calendars.ts"
import { type CachedCalendar, type CachedTask, cacheUnavailable, getStorage } from "./db.ts"
import { setCachedTasks } from "./tasks.ts"

/** True while a refresh is running. */
export const syncing = signal(false)

/** When the last refresh got an answer from the server, or `null` before the first. */
export const lastSyncedAt = signal<Date | null>(null)

export { cacheUnavailable }

/** Fills the stores from the cache, so the app shows its last copy before the network answers. */
export async function loadCache(): Promise<void> {
  try {
    const storage = getStorage()
    const [cachedCalendars, cachedTasks] = await Promise.all([
      storage.listCalendars(),
      storage.listTasks(),
    ])
    calendars.value = cachedCalendars
    setCachedTasks(cachedTasks)
    cacheUnavailable.value = false
  } catch {
    // IndexedDB blocked or failing (a private window, a full disk). The stores keep what they hold.
    cacheUnavailable.value = true
  }
  calendarsLoaded.value = true
}

let running: Promise<void> | undefined

/**
 * Brings the cache up to date: reads the list of calendars, and fetches the tasks of each one whose
 * change marker differs from the one its cached tasks came from. Calls that overlap share one run.
 * With no answer from the server the cache stays as it is.
 */
export function refresh(): Promise<void> {
  return running ??= run().finally(() => {
    running = undefined
  })
}

async function run(): Promise<void> {
  syncing.value = true
  try {
    const listed = await relay(CALDAV_PATHS.calendars, {}, calendarListSchema)
    if (!listed.ok) return
    const storage = getStorage()
    const before = new Map((await storage.listCalendars()).map((c) => [c.href, c]))
    const next = listed.data.calendars.map((calendar): CachedCalendar => ({
      ...calendar,
      syncedMarker: before.get(calendar.href)?.syncedMarker,
      completedLoaded: before.get(calendar.href)?.completedLoaded ?? false,
    }))
    await storage.replaceCalendars(next)
    for (const calendar of next) {
      const unchanged = calendar.changeMarker !== undefined &&
        calendar.changeMarker === calendar.syncedMarker
      if (!unchanged && !await fetchTasks(calendar, calendar.completedLoaded)) break
    }
    lastSyncedAt.value = new Date()
  } catch {
    cacheUnavailable.value = true
  } finally {
    // loadCache never throws, so the spinner is always cleared.
    syncing.value = false
    await loadCache()
  }
}

/**
 * Fetches the tasks of `calendar` and replaces its cached ones. Resolves false when the server did
 * not answer, so the caller stops asking.
 */
async function fetchTasks(calendar: CachedCalendar, completed: boolean): Promise<boolean> {
  const query = `calendar=${encodeURIComponent(calendar.href)}${completed ? `&completed=true` : ``}`
  const result = await relay(`${CALDAV_PATHS.objects}?${query}`, {}, objectListSchema)
  if (!result.ok) return !result.offline
  const rows: CachedTask[] = result.data.objects.map((object) => ({
    href: object.href,
    calendarHref: calendar.href,
    etag: object.etag,
    ics: object.ics,
  }))
  await getStorage().replaceCalendarTasks(
    { ...calendar, syncedMarker: calendar.changeMarker, completedLoaded: completed },
    rows,
  )
  return true
}

/**
 * Loads the completed tasks of one list too, for the screen that shows them. The list keeps them
 * in later refreshes.
 */
export async function loadCompleted(calendarHref: string): Promise<boolean> {
  const calendar = calendars.value.find((c) => c.href === calendarHref)
  if (!calendar) return false
  let ok = false
  try {
    ok = await fetchTasks(calendar, true)
  } catch {
    cacheUnavailable.value = true
  }
  await loadCache()
  return ok
}

/**
 * Starts the data layer: shows the cache, refreshes, and refreshes again whenever the page becomes
 * visible or the network returns. Returns the function that stops the watching.
 */
export function startSync(
  target?: Parameters<typeof watchPageResume>[1],
  connectionTarget?: Parameters<typeof connection.watch>[0],
): () => void {
  const stopConnection = connection.watch(connectionTarget)
  const stop = watchPageResume(() => void refresh(), target)
  void loadCache().then(refresh)
  return () => {
    stop()
    stopConnection()
  }
}
