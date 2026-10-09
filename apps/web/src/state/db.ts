import { Dexie, type EntityTable } from "dexie"
import type { Calendar } from "@api/caldav.ts"

/** A calendar as the cache keeps it: what the server listed, plus how far the tasks are in step. */
export interface CachedCalendar extends Calendar {
  /**
   * The `changeMarker` the cached tasks of this calendar were fetched under. When the server still
   * reports the same marker, nothing changed and the fetch is skipped.
   */
  syncedMarker?: string
  /** Whether the cached tasks include the completed ones. Open-only until a list asks for more. */
  completedLoaded: boolean
}

/** One task as the cache keeps it: the raw text is what keeps every edit lossless. */
export interface CachedTask {
  href: string
  calendarHref: string
  /** Exactly what the server sent, quotes included, or `null` when it sent none. */
  etag: string | null
  ics: string
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
  /** Swaps every cached task of `calendar` for `tasks` and stores `calendar`, in one step. */
  replaceCalendarTasks(calendar: CachedCalendar, tasks: CachedTask[]): Promise<void>
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
    replaceCalendarTasks: (calendar, tasks) =>
      db.transaction(`rw`, db.calendars, db.tasks, async () => {
        await db.tasks.where(`calendarHref`).equals(calendar.href).delete()
        await db.tasks.bulkPut(tasks)
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
