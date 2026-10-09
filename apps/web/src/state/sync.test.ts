/// <reference lib="deno.ns" />
import "fake-indexeddb/auto"
import { expect } from "@std/expect"
import { CALDAV_PATHS } from "@api/caldav.ts"
import { LIST_HREF, task } from "@tasks/fixtures/tasksorg.ts"
import { calendars } from "./calendars.ts"
import { notice, OFFLINE_NOTICE } from "./connection.ts"
import { tasks } from "./tasks.ts"
import { lastSyncedAt, loadCache, loadCompleted, refresh, startSync } from "./sync.ts"
import { error, type FakeServer, withApp } from "./testing.ts"

const OPEN = `${LIST_HREF}open.ics`
const DONE = `${LIST_HREF}done.ics`

function seedList(server: FakeServer, marker = `ctag-1`) {
  server.calendarList = [{ href: LIST_HREF, displayName: `Errands`, changeMarker: marker }]
  server.seed(OPEN, LIST_HREF, task(`1`, `Buy milk`))
  server.seed(DONE, LIST_HREF, task(`2`, `Old one`), true)
}

const titles = () => tasks.value.map((t) => t.title).sort()

Deno.test(`a reload with the network off shows the last lists and tasks, and the offline notice`, async () => {
  await withApp(async (server) => {
    seedList(server)
    await refresh()
    calendars.value = []
    tasks.value = []

    server.down = true
    await loadCache()
    await refresh()

    expect(calendars.value.map((c) => c.displayName)).toEqual([`Errands`])
    expect(titles()).toEqual([`Buy milk`])
    expect(notice.value).toBe(OFFLINE_NOTICE)
  })
})

Deno.test(`an unchanged ctag skips the task fetch, a changed one fetches again`, async () => {
  await withApp(async (server) => {
    seedList(server)
    await refresh()
    await refresh()
    expect(server.count(`GET`, CALDAV_PATHS.calendars)).toBe(2)
    expect(server.count(`GET`, CALDAV_PATHS.objects)).toBe(1)

    server.calendarList[0].changeMarker = `ctag-2`
    server.seed(`${LIST_HREF}new.ics`, LIST_HREF, task(`3`, `Walk dog`))
    await refresh()
    expect(server.count(`GET`, CALDAV_PATHS.objects)).toBe(2)
    expect(titles()).toEqual([`Buy milk`, `Walk dog`])
  })
})

Deno.test(`a calendar with no change marker is fetched on every refresh`, async () => {
  await withApp(async (server) => {
    seedList(server)
    server.calendarList[0].changeMarker = undefined
    await refresh()
    await refresh()
    expect(server.count(`GET`, CALDAV_PATHS.objects)).toBe(2)
  })
})

Deno.test(`completed tasks come only after a list asks for them, and stay on later refreshes`, async () => {
  await withApp(async (server) => {
    seedList(server)
    await refresh()
    expect(titles()).toEqual([`Buy milk`])
    expect(server.sent.some((s) => s.search.get(`completed`) === `true`)).toBe(false)

    expect(await loadCompleted(LIST_HREF)).toBe(true)
    expect(titles()).toEqual([`Buy milk`, `Old one`])

    server.calendarList[0].changeMarker = `ctag-2`
    await refresh()
    expect(titles()).toEqual([`Buy milk`, `Old one`])
  })
})

Deno.test(`a refresh the server does not answer leaves the cache as it was`, async () => {
  await withApp(async (server) => {
    seedList(server)
    await refresh()
    const before = lastSyncedAt.value
    server.down = true
    server.calendarList[0].changeMarker = `ctag-2`
    await refresh()
    expect(titles()).toEqual([`Buy milk`])
    expect(lastSyncedAt.value).toBe(before)
  })
})

Deno.test(`a list deleted on the server disappears with its tasks`, async () => {
  await withApp(async (server) => {
    seedList(server)
    await refresh()
    server.calendarList = []
    await refresh()
    expect(calendars.value).toEqual([])
    expect(tasks.value).toEqual([])
  })
})

Deno.test(`a failure from the CalDAV server keeps the last copy and shows the status`, async () => {
  await withApp(async (server) => {
    seedList(server)
    await refresh()
    server.next = error(502, `caldav_refused`)
    await refresh()
    expect(titles()).toEqual([`Buy milk`])
    expect(notice.value).toContain(`(502)`)
  })
})

Deno.test(`overlapping refreshes share one run`, async () => {
  await withApp(async (server) => {
    seedList(server)
    await Promise.all([refresh(), refresh(), refresh()])
    expect(server.count(`GET`, CALDAV_PATHS.calendars)).toBe(1)
  })
})

Deno.test(`sync refreshes on start, when the page is shown again and when the network returns`, async () => {
  await withApp(async (server) => {
    seedList(server)
    const listeners = new Map<string, (event: Event) => void>()
    const visibility = { state: `hidden` }
    const stop = startSync({
      document: {
        addEventListener: (type, listener) => void listeners.set(type, listener),
        removeEventListener: (type) => void listeners.delete(type),
        get visibilityState() {
          return visibility.state
        },
      },
      addEventListener: (type, listener) => void listeners.set(type, listener),
      removeEventListener: (type) => void listeners.delete(type),
    })
    // The start-up refresh runs on its own; wait for it to finish.
    for (let waited = 0; !lastSyncedAt.value && waited < 200; waited++) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    expect(lastSyncedAt.value).not.toBeNull()
    expect(server.count(`GET`, CALDAV_PATHS.calendars)).toBe(1)

    visibility.state = `visible`
    listeners.get(`visibilitychange`)!(new Event(`visibilitychange`))
    await refresh()
    expect(server.count(`GET`, CALDAV_PATHS.calendars)).toBe(2)

    listeners.get(`online`)!(new Event(`online`))
    await refresh()
    expect(server.count(`GET`, CALDAV_PATHS.calendars)).toBe(3)

    stop()
    expect(listeners.size).toBe(0)
  })
})
