import { signal } from "@preact/signals"
import { Dexie, type EntityTable } from "dexie"
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
 * the browser's IndexedDB is one implementation of it ({@link createDexieStorage}).
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

/** The cache in IndexedDB, through Dexie. `name` is the database name. */
export function createDexieStorage(name = `caldav-tasks`): TaskStorage {
  const db = new Dexie(name) as Dexie & {
    calendars: EntityTable<CachedCalendar, `href`>
    tasks: EntityTable<CachedTask, `href`>
  }
  db.version(1).stores({ calendars: `href`, tasks: `href, calendarHref` })
  return {
    listCalendars: () => db.calendars.toArray(),
    listTasks: () => db.tasks.toArray(),
    replaceCalendars: (calendars) =>
      db.transaction(`rw`, db.calendars, db.tasks, async () => {
        const keep = new Set(calendars.map((calendar) => calendar.href))
        const gone = (await db.calendars.toCollection().primaryKeys()).filter((href) =>
          !keep.has(href)
        )
        await db.tasks.where(`calendarHref`).anyOf(gone).delete()
        await db.calendars.bulkDelete(gone)
        await db.calendars.bulkPut(calendars)
      }),
    listVersions: async (calendarHref) =>
      (await db.tasks.where(`calendarHref`).equals(calendarHref).toArray())
        .map(({ href, etag }) => ({ href, etag })),
    applyChanges: (calendar, { upsert, remove }) =>
      db.transaction(`rw`, db.calendars, db.tasks, async () => {
        await db.tasks.bulkDelete(remove)
        await db.tasks.bulkPut(upsert.map((object) => ({ ...object, calendarHref: calendar.href })))
        await db.calendars.put(calendar)
      }),
    putTask: async (task) => void await db.tasks.put(task),
    deleteTask: (href) => db.tasks.delete(href),
    close: () => db.close(),
  }
}

let current: TaskStorage | undefined

/** The app's cache, opened on first use. */
export function getStorage(): TaskStorage {
  return current ??= createDexieStorage()
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
