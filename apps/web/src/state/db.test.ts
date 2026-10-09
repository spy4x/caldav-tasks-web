/// <reference lib="deno.ns" />
import "fake-indexeddb/auto"
import { expect } from "@std/expect"
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

Deno.test(`replacing a calendar's tasks keeps the tasks of the other calendars`, async () => {
  await withStorage(async (s) => {
    const a = cal(`/a/`)
    const b = cal(`/b/`)
    await s.replaceCalendars([a, b])
    await s.replaceCalendarTasks(a, [row(`/a/1.ics`, `/a/`), row(`/a/2.ics`, `/a/`)])
    await s.replaceCalendarTasks(b, [row(`/b/1.ics`, `/b/`)])
    await s.replaceCalendarTasks({ ...a, syncedMarker: `m2` }, [row(`/a/3.ics`, `/a/`)])
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
    await s.replaceCalendarTasks(a, [row(`/a/1.ics`, `/a/`)])
    await s.replaceCalendarTasks(b, [row(`/b/1.ics`, `/b/`)])
    await s.replaceCalendars([b])
    expect((await s.listCalendars()).map((c) => c.href)).toEqual([`/b/`])
    expect((await s.listTasks()).map((t) => t.href)).toEqual([`/b/1.ics`])
  })
})

Deno.test(`a deleted task is gone from the cache`, async () => {
  await withStorage(async (s) => {
    await s.putTask(row(`/a/1.ics`, `/a/`))
    await s.deleteTask(`/a/1.ics`)
    expect(await s.listTasks()).toEqual([])
  })
})
