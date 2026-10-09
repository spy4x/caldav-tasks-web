import { signal } from "@preact/signals"
import {
  type CalDavSyncStore,
  type CalDavSyncTransport,
  createCalDavSync,
} from "@spy4x/caldav/sync"
import {
  createSyncRunner,
  flushOutbox,
  type SyncRunner,
  type SyncRunnerState,
  type SyncRunnerTarget,
} from "@spy4x/realtime/sync-runner"
import { CALDAV_PATHS, type Calendar, calendarListSchema, objectListSchema } from "@api/caldav.ts"
import { connection, relay } from "./connection.ts"
import { calendars, calendarsLoaded } from "./calendars.ts"
import { cacheUnavailable, getStorage } from "./db.ts"
import { getOutbox, loadOutbox } from "./outbox.ts"
import { watchPersistence } from "./persistence.ts"
import { setCachedTasks } from "./task-store.ts"

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

/** Reaches the server through the relay, as the sync engine's transport. */
const transport: CalDavSyncTransport<Calendar> = {
  async listCalendars() {
    const listed = await relay(CALDAV_PATHS.calendars, {}, calendarListSchema)
    return listed.ok
      ? { ok: true, data: listed.data.calendars }
      : { ok: false, offline: listed.offline }
  },
  async listObjects(calendar, { includeCompleted }) {
    const query = `calendar=${encodeURIComponent(calendar.href)}${
      includeCompleted ? `&completed=true` : ``
    }`
    const result = await relay(`${CALDAV_PATHS.objects}?${query}`, {}, objectListSchema)
    return result.ok
      ? { ok: true, data: result.data.objects }
      : { ok: false, offline: result.offline }
  },
}

/** The cache the engine writes to: whichever storage the app has open at the time of the call. */
const store: CalDavSyncStore<Calendar> = {
  listCalendars: () => getStorage().listCalendars(),
  listVersions: (calendarHref) => getStorage().listVersions(calendarHref),
  replaceCalendars: (list) => getStorage().replaceCalendars(list),
  applyChanges: (calendar, changes) => getStorage().applyChanges(calendar, changes),
}

const engine = createCalDavSync(transport, store)

/**
 * Brings the cache up to date: reads the list of calendars, and fetches the tasks of each one whose
 * change marker differs from the one its cached tasks came from, writing only the tasks whose etag
 * changed. Calls that overlap share one run. With no answer from the server the cache stays as it
 * is.
 */
export async function refresh(): Promise<void> {
  syncing.value = true
  try {
    const outcome = await engine.refresh()
    if (outcome.answered) lastSyncedAt.value = new Date()
  } catch {
    cacheUnavailable.value = true
  } finally {
    // loadCache never throws, so the spinner is always cleared.
    syncing.value = false
    await loadCache()
  }
}

/**
 * Loads the completed tasks of one list too, for the screen that shows them. The list keeps them
 * in later refreshes.
 */
export async function loadCompleted(calendarHref: string): Promise<boolean> {
  let ok = false
  try {
    ok = await engine.loadCompleted(calendarHref)
  } catch {
    cacheUnavailable.value = true
  }
  await loadCache()
  return ok
}

/** What the sync runner is doing, for the status line. `null` before the app starts it. */
export const runnerState = signal<SyncRunnerState | null>(null)

let runner: SyncRunner | undefined

/** Sends what is queued and refreshes the cache, now. Resolves when that run has finished. */
export function syncNow(): Promise<void> {
  return runner?.kick() ?? Promise.resolve()
}

/**
 * Starts the data layer: shows the cache and the queued writes, then sends the queue and refreshes.
 * It does so again whenever the page becomes visible or gains focus, or the network returns, and
 * keeps trying with growing pauses while a write cannot be sent. Returns the function that stops it.
 */
export function startSync(
  target?: SyncRunnerTarget,
  connectionTarget?: Parameters<typeof connection.watch>[0],
): () => void {
  const stopConnection = connection.watch(connectionTarget)
  const sendQueue = flushOutbox(getOutbox())
  const own = createSyncRunner({
    target,
    flush: async () => {
      const result = await sendQueue()
      // A server that could not be reached for the queue cannot answer a refresh either.
      if (result !== `unreachable`) await refresh()
      return result
    },
  })
  runner = own
  const stopPersistence = watchPersistence()
  const stopState = own.subscribe((state) => runnerState.value = state)
  let stopped = false
  void Promise.all([loadCache(), loadOutbox()]).then(() => {
    if (!stopped) own.start()
  })
  return () => {
    stopped = true
    own.stop()
    stopState()
    stopPersistence()
    stopConnection()
    if (runner === own) runner = undefined
    runnerState.value = null
  }
}
