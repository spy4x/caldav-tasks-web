/// <reference lib="deno.ns" />
import "fake-indexeddb/auto"
import { expect } from "@std/expect"
import type { SyncObject } from "@spy4x/caldav/sync"
import { type CachedCalendar, type CachedTask, createDexieStorage } from "./db.ts"

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
async function withStorage(test: (s: ReturnType<typeof createDexieStorage>) => Promise<void>) {
  const storage = createDexieStorage(`db-test-${++databases}`)
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
