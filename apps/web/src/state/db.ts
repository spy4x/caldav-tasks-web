import { signal } from "@preact/signals"
import { createIndexedDbCalDavCache } from "@spy4x/caldav/indexeddb"
import type { StoredCalendar, SyncChanges, SyncObject, SyncObjectVersion } from "@spy4x/caldav/sync"
import type { Calendar } from "@api/caldav.ts"

/** A calendar as the cache keeps it: what the server listed, plus how far the tasks are in step. */
export type CachedCalendar = StoredCalendar<Calendar>

/** One task as the cache keeps it: the raw text is what keeps every edit lossless. */
export interface CachedTask extends SyncObject {
  calendarHref: string
}

/**
 * Where the last copy of every list and task is kept. The stores talk to this interface only, so
 * the browser's IndexedDB is one implementation of it ({@link createIndexedDbStorage}).
 */
export interface TaskStorage {
  listCalendars(): Promise<CachedCalendar[]>
  listTasks(): Promise<CachedTask[]>
  /** Keeps exactly these calendars. A calendar missing from `calendars` loses its tasks too. */
  replaceCalendars(calendars: CachedCalendar[]): Promise<void>
  /** The address and etag of every cached task of one calendar. */
  listVersions(calendarHref: string): Promise<SyncObjectVersion[]>
  /** Stores `calendar` and applies `changes` to its cached tasks, in one step. */
  applyChanges(calendar: CachedCalendar, changes: SyncChanges): Promise<void>
  putTask(task: CachedTask): Promise<void>
  deleteTask(href: string): Promise<void>
  close(): void
}

/** The name of the IndexedDB database an earlier version of the app kept its cache in (Dexie). */
export const LEGACY_DATABASE = `caldav-tasks`

/**
 * Deletes the database an earlier version of the app kept its cache in. It is only a copy of the
 * server, so the new cache rebuilds on the next sync. Every failure is ignored: a blocked or
 * missing IndexedDB must not stop the app.
 */
export function deleteLegacyDatabase(factory: IDBFactory | undefined = globalThis.indexedDB): void {
  try {
    const request = factory?.deleteDatabase(LEGACY_DATABASE)
    if (request) request.onerror = () => {}
  } catch {
    // Nothing to clean up, or no permission to.
  }
}

/** The cache in IndexedDB. `name` is the database name. */
export function createIndexedDbStorage(name = `caldav-cache`): TaskStorage {
  const cache = createIndexedDbCalDavCache<StoredCalendar<Calendar>>({ name })
  return {
    listCalendars: () => cache.listCalendars(),
    listTasks: () => cache.listObjects(),
    replaceCalendars: (calendars) => cache.replaceCalendars(calendars),
    listVersions: (calendarHref) => cache.listVersions(calendarHref),
    applyChanges: (calendar, changes) => cache.applyChanges(calendar, changes),
    putTask: (task) => cache.putObject(task),
    deleteTask: (href) => cache.deleteObject(href),
    close: () => cache.close(),
  }
}

let current: TaskStorage | undefined

/** The app's cache, opened on first use. */
export function getStorage(): TaskStorage {
  if (!current) {
    deleteLegacyDatabase()
    current = createIndexedDbStorage()
  }
  return current
}

/** Swaps the app's cache, for a test. Closes the one it replaces. */
export function useStorage(storage: TaskStorage | undefined): void {
  current?.close()
  current = storage
}

/**
 * True when the cache could not be read or written. Screens then get empty stores with
 * `calendarsLoaded` true, and should say the last copy is unavailable; the app never throws.
 */
export const cacheUnavailable = signal(false)
