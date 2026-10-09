/// <reference lib="deno.ns" />
import "fake-indexeddb/auto"
import { expect } from "@std/expect"
import { CALDAV_PATHS } from "@api/caldav.ts"
import { LIST_HREF, task } from "@tasks/fixtures/tasksorg.ts"
import { calendars, calendarsLoaded } from "./calendars.ts"
import { type TaskStorage, useStorage } from "./db.ts"
import { notice, OFFLINE_NOTICE } from "./connection.ts"
import { pendingEntries } from "./pending.ts"
import { saveTask, tasks } from "./tasks.ts"
import {
  cacheUnavailable,
  lastSyncedAt,
  loadCache,
  loadCompleted,
  POLL_INTERVAL_MS,
  refresh,
  runnerState,
  startSync,
  syncing,
} from "./sync.ts"
import { error, type FakeServer, setBrowserOnline, withApp } from "./testing.ts"

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

Deno.test(`a task deleted on the server disappears on the next refresh and the others stay`, async () => {
  await withApp(async (server) => {
    seedList(server)
    server.seed(`${LIST_HREF}new.ics`, LIST_HREF, task(`3`, `Walk dog`))
    await refresh()
    expect(titles()).toEqual([`Buy milk`, `Walk dog`])

    server.objects.delete(OPEN)
    server.calendarList[0].changeMarker = `ctag-2`
    await refresh()
    expect(titles()).toEqual([`Walk dog`])
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
    const connection = new Map<string, () => void>()
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
    }, {
      addEventListener: (type, listener) => void connection.set(type, listener),
      removeEventListener: (type) => void connection.delete(type),
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

    connection.get(`offline`)!()
    expect(notice.value).toBe(OFFLINE_NOTICE)
    connection.get(`online`)!()
    expect(notice.value).toBeNull()

    stop()
    expect(listeners.size).toBe(0)
    expect(connection.size).toBe(0)
  })
})

Deno.test(`sync asks the server again when its 30 second poll timer fires, while the page is visible`, async () => {
  await withApp(async (server) => {
    seedList(server)
    const timers: { callback: () => void; ms: number }[] = []
    const realSetTimeout = globalThis.setTimeout
    globalThis.setTimeout = ((callback: () => void, ms?: number, ...rest: unknown[]) => {
      timers.push({ callback, ms: ms ?? 0 })
      return realSetTimeout(callback, ms, ...rest)
    }) as typeof setTimeout
    const stop = startSync({
      document: {
        addEventListener: () => {},
        removeEventListener: () => {},
        visibilityState: `visible`,
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    }, {
      addEventListener: () => {},
      removeEventListener: () => {},
    })
    try {
      const poll = () => timers.findLast((timer) => timer.ms === POLL_INTERVAL_MS)
      for (let waited = 0; !poll() && waited < 200; waited++) {
        await new Promise((resolve) => realSetTimeout(resolve, 5))
      }
      expect(POLL_INTERVAL_MS).toBe(30_000)
      expect(poll()).toBeDefined()
      expect(server.count(`GET`, CALDAV_PATHS.calendars)).toBe(1)

      // When the poll timer fires, the runner refreshes: a stray timer would not.
      poll()!.callback()
      for (
        let waited = 0;
        server.count(`GET`, CALDAV_PATHS.calendars) < 2 && waited < 200;
        waited++
      ) {
        await new Promise((resolve) => realSetTimeout(resolve, 5))
      }
      expect(server.count(`GET`, CALDAV_PATHS.calendars)).toBe(2)
    } finally {
      globalThis.setTimeout = realSetTimeout
      stop()
    }
  })
})

Deno.test(`sync sends the queued writes before it refreshes, when the network returns`, async () => {
  await withApp(async (server) => {
    seedList(server)
    await refresh()
    const before = tasks.value.find((t) => t.title === `Buy milk`)!
    setBrowserOnline(false)
    await saveTask(before, { title: `Oat milk` })
    expect(server.objects.get(OPEN)!.ics).toContain(`SUMMARY:Buy milk`)
    // Starting the app reads the browser's own state again, which says online: the server is down.
    server.down = true

    const listeners = new Map<string, (event: Event) => void>()
    const connection = new Map<string, () => void>()
    const sentBefore = server.sent.length
    const stop = startSync({
      document: {
        addEventListener: () => {},
        removeEventListener: () => {},
        visibilityState: `visible`,
      },
      addEventListener: (type, listener) => void listeners.set(type, listener),
      removeEventListener: (type) => void listeners.delete(type),
    }, {
      addEventListener: (type, listener) => void connection.set(type, listener),
      removeEventListener: (type) => void connection.delete(type),
    })
    try {
      // The first try finds no server: the write stays queued and a retry is planned.
      for (let waited = 0; !runnerState.value?.failures && waited < 200; waited++) {
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
      expect(pendingEntries.value.length).toBe(1)
      expect(server.objects.get(OPEN)!.ics).toContain(`SUMMARY:Buy milk`)
      // A server that did not answer the queue is not asked to list anything either.
      expect(server.sent.slice(sentBefore).filter((request) => request.method === `GET`)).toEqual(
        [],
      )

      server.down = false
      listeners.get(`online`)!(new Event(`online`))
      for (let waited = 0; pendingEntries.value.length > 0 && waited < 200; waited++) {
        await new Promise((resolve) => setTimeout(resolve, 5))
      }

      expect(server.objects.get(OPEN)!.ics).toContain(`SUMMARY:Oat milk`)
      expect(pendingEntries.value).toEqual([])
    } finally {
      stop()
    }
  })
})

/** A storage that fails on every call, as IndexedDB does when blocked. */
function brokenStorage(): TaskStorage {
  const fail = () => Promise.reject(new DOMException(`blocked`, `SecurityError`))
  return {
    listCalendars: fail,
    listTasks: fail,
    replaceCalendars: fail,
    listVersions: fail,
    applyChanges: fail,
    putTask: fail,
    deleteTask: fail,
    close: () => {},
  }
}

Deno.test(`a storage that throws ends the refresh quietly and tells the screens the cache is gone`, async () => {
  await withApp(async (server) => {
    seedList(server)
    useStorage(brokenStorage())

    await refresh()
    await loadCache()

    expect(syncing.value).toBe(false)
    expect(cacheUnavailable.value).toBe(true)
    expect(calendarsLoaded.value).toBe(true)
    expect(tasks.value).toEqual([])
  })
})

Deno.test(`loading completed tasks with a storage that throws resolves and flags the cache`, async () => {
  await withApp(async (server) => {
    seedList(server)
    await refresh()
    useStorage(brokenStorage())

    const ok = await loadCompleted(LIST_HREF)

    expect(ok).toBe(false)
    expect(cacheUnavailable.value).toBe(true)
  })
})
