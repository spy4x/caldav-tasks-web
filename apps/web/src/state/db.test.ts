/// <reference lib="deno.ns" />
import "fake-indexeddb/auto"
import { expect } from "@std/expect"
import type { SyncObject } from "@spy4x/caldav/sync"
import {
  type CachedCalendar,
  type CachedTask,
  createIndexedDbStorage,
  deleteLegacyDatabase,
  getStorage,
  LEGACY_DATABASE,
  useStorage,
} from "./db.ts"

const cal = (href: string, rest: Partial<CachedCalendar> = {}): CachedCalendar => ({
  href,
  displayName: href,
  components: [`VTODO`],
  completedLoaded: false,
  ...rest,
})
const row = (href: string, calendarHref: string): CachedTask => ({
  href,
  calendarHref,
  etag: `"1"`,
  ics: `ICS ${href}`,
})

const obj = (href: string, etag: string | null = `"1"`): SyncObject => ({
  href,
  etag,
  ics: `ICS ${href}`,
})

let databases = 0
async function withStorage(test: (s: ReturnType<typeof createIndexedDbStorage>) => Promise<void>) {
  const storage = createIndexedDbStorage(`db-test-${++databases}`)
  try {
    await test(storage)
  } finally {
    storage.close()
  }
}

Deno.test(`the cache returns the raw text and etag it was given`, async () => {
  await withStorage(async (s) => {
    await s.replaceCalendars([cal(`/a/`)])
    await s.putTask({ href: `/a/1.ics`, calendarHref: `/a/`, etag: null, ics: `RAW\r\nTEXT` })
    expect(await s.listTasks()).toEqual([
      { href: `/a/1.ics`, calendarHref: `/a/`, etag: null, ics: `RAW\r\nTEXT` },
    ])
  })
})

Deno.test(`applying changes to a calendar keeps the tasks of the other calendars`, async () => {
  await withStorage(async (s) => {
    const a = cal(`/a/`)
    const b = cal(`/b/`)
    await s.replaceCalendars([a, b])
    await s.applyChanges(a, { upsert: [obj(`/a/1.ics`), obj(`/a/2.ics`)], remove: [] })
    await s.applyChanges(b, { upsert: [obj(`/b/1.ics`)], remove: [] })
    await s.applyChanges({ ...a, syncedMarker: `m2` }, {
      upsert: [obj(`/a/3.ics`)],
      remove: [`/a/1.ics`, `/a/2.ics`],
    })
    const hrefs = (await s.listTasks()).map((t) => t.href).sort()
    expect(hrefs).toEqual([`/a/3.ics`, `/b/1.ics`])
    expect((await s.listCalendars()).find((c) => c.href === `/a/`)?.syncedMarker).toBe(`m2`)
  })
})

Deno.test(`a calendar that is no longer listed loses its tasks`, async () => {
  await withStorage(async (s) => {
    const a = cal(`/a/`)
    const b = cal(`/b/`)
    await s.replaceCalendars([a, b])
    await s.applyChanges(a, { upsert: [obj(`/a/1.ics`)], remove: [] })
    await s.applyChanges(b, { upsert: [obj(`/b/1.ics`)], remove: [] })
    await s.replaceCalendars([b])
    expect((await s.listCalendars()).map((c) => c.href)).toEqual([`/b/`])
    expect((await s.listTasks()).map((t) => t.href)).toEqual([`/b/1.ics`])
  })
})

Deno.test(`the versions of a calendar are the hrefs and etags of its cached tasks only`, async () => {
  await withStorage(async (s) => {
    const a = cal(`/a/`)
    const b = cal(`/b/`)
    await s.replaceCalendars([a, b])
    await s.applyChanges(a, { upsert: [obj(`/a/1.ics`, `"1"`), obj(`/a/2.ics`, null)], remove: [] })
    await s.applyChanges(b, { upsert: [obj(`/b/1.ics`)], remove: [] })
    expect((await s.listVersions(`/a/`)).sort((x, y) => x.href.localeCompare(y.href))).toEqual([
      { href: `/a/1.ics`, etag: `"1"` },
      { href: `/a/2.ics`, etag: null },
    ])
  })
})

Deno.test(`a deleted task is gone from the cache`, async () => {
  await withStorage(async (s) => {
    await s.putTask(row(`/a/1.ics`, `/a/`))
    await s.deleteTask(`/a/1.ics`)
    expect(await s.listTasks()).toEqual([])
  })
})

/** Creates a database the way Dexie did: its version is ten times its schema version. */
async function createLegacyDatabase(name: string, factory: IDBFactory = indexedDB): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = factory.open(name, 10)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(`tasks`, { keyPath: `href` })
    }
    request.onsuccess = () => {
      request.result.close()
      resolve()
    }
    request.onerror = () => reject(request.error)
  })
}

const databaseNames = async (): Promise<string[]> =>
  (await indexedDB.databases()).map((database) => database.name!)

Deno.test(`the database of the old Dexie cache is deleted and the new cache is left alone`, async () => {
  await createLegacyDatabase(LEGACY_DATABASE)
  await createLegacyDatabase(`caldav-tasks-outbox`)
  await withStorage(async (s) => {
    await s.replaceCalendars([cal(`/a/`)])
    expect(await databaseNames()).toContain(LEGACY_DATABASE)

    deleteLegacyDatabase()

    for (
      let waited = 0;
      (await databaseNames()).includes(LEGACY_DATABASE) && waited < 200;
      waited++
    ) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    expect(await databaseNames()).not.toContain(LEGACY_DATABASE)
    expect(await databaseNames()).toContain(`caldav-tasks-outbox`)
    expect((await s.listCalendars()).map((c) => c.href)).toEqual([`/a/`])
  })
})

Deno.test(`the app's cache opens empty beside the old database, which it then deletes`, async () => {
  await createLegacyDatabase(LEGACY_DATABASE)
  useStorage(undefined)
  const s = getStorage()
  try {
    expect(await s.listCalendars()).toEqual([])
    expect(await s.listTasks()).toEqual([])
    await s.replaceCalendars([cal(`/a/`)])
    expect((await s.listCalendars()).map((c) => c.href)).toEqual([`/a/`])
    for (
      let waited = 0;
      (await databaseNames()).includes(LEGACY_DATABASE) && waited < 200;
      waited++
    ) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    const names = await databaseNames()
    expect(names).not.toContain(LEGACY_DATABASE)
    expect(names).toContain(`caldav-cache`)
  } finally {
    useStorage(undefined)
    indexedDB.deleteDatabase(`caldav-cache`)
  }
})

Deno.test(`a factory that throws or has no deleteDatabase does not stop the app`, () => {
  const throwing = {
    deleteDatabase: () => {
      throw new DOMException(`blocked`, `SecurityError`)
    },
  }
  deleteLegacyDatabase(throwing as unknown as IDBFactory)
  deleteLegacyDatabase({} as unknown as IDBFactory)
  deleteLegacyDatabase(undefined)
})
