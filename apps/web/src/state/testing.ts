/// <reference lib="deno.ns" />
// Dexie reads `indexedDB` when it loads, so the fake must be imported before anything that uses it.
import "fake-indexeddb/auto"
import { CALDAV_PATHS } from "@api/caldav.ts"
import { connection, resetConnection } from "./connection.ts"
import { createDexieStorage, useStorage } from "./db.ts"
import { calendars, calendarsLoaded } from "./calendars.ts"
import { cacheUnavailable, lastSyncedAt } from "./sync.ts"
import { tasks } from "./tasks.ts"

/** Helpers for the tests of the data layer. Not imported by the app. */

export interface FakeObject {
  calendar: string
  etag: string
  ics: string
  /** Whether the server lists it only when asked for completed tasks. */
  completed?: boolean
}

export interface SentRequest {
  method: string
  path: string
  search: URLSearchParams
}

/** A CalDAV relay in memory: the routes the data layer uses, with real etag checking. */
export class FakeServer {
  calendarList: { href: string; displayName: string; changeMarker?: string }[] = []
  objects = new Map<string, FakeObject>()
  sent: SentRequest[] = []
  /** Every request throws as `fetch` does with no network. */
  down = false
  /** When set, the next response is this one, once. */
  next: Response | undefined
  /** Runs just before a PUT is checked, so a test can change the task "from the phone". */
  beforePut: ((href: string) => void) | undefined
  private version = 1

  nextEtag(): string {
    return `"${++this.version}"`
  }

  /** Puts a task on the server as another client would. */
  seed(href: string, calendar: string, ics: string, completed = false): string {
    const etag = this.nextEtag()
    this.objects.set(href, { calendar, etag, ics, completed })
    return etag
  }

  count(method: string, path: string): number {
    return this.sent.filter((s) => s.method === method && s.path === path).length
  }

  handle(request: Request): Response | Promise<Response> {
    const url = new URL(request.url)
    this.sent.push({ method: request.method, path: url.pathname, search: url.searchParams })
    if (this.down) throw new TypeError(`Failed to fetch`)
    if (this.next) {
      const response = this.next
      this.next = undefined
      return response
    }
    if (url.pathname === CALDAV_PATHS.calendars) {
      return Response.json({
        calendars: this.calendarList.map((c) => ({ ...c, components: [`VTODO`] })),
      })
    }
    if (url.pathname === CALDAV_PATHS.objects && request.method === `POST`) {
      return request.json().then((body: { calendar: string; ics: string }) => {
        const uid = /^UID:(.*)$/m.exec(body.ics)?.[1]?.trim() ?? `new-${this.version}`
        const href = `${body.calendar}${uid}.ics`
        if (this.objects.has(href)) return error(412, `conflict`)
        const etag = this.seed(href, body.calendar, body.ics)
        return Response.json({ href, etag }, { status: 201 })
      })
    }
    if (url.pathname === CALDAV_PATHS.objects) {
      const calendar = url.searchParams.get(`calendar`)
      const all = url.searchParams.get(`completed`) === `true`
      const objects = [...this.objects.entries()]
        .filter(([, o]) => o.calendar === calendar && (all || !o.completed))
        .map(([href, o]) => ({ href, etag: o.etag, ics: o.ics }))
      return Response.json({ objects })
    }
    if (url.pathname === CALDAV_PATHS.object && request.method === `GET`) {
      const href = url.searchParams.get(`href`)!
      const found = this.objects.get(href)
      if (!found) return error(404, `not_found`)
      return Response.json({ href, etag: found.etag, ics: found.ics })
    }
    if (url.pathname === CALDAV_PATHS.object && request.method === `PUT`) {
      return request.json().then((body: { href: string; etag: string; ics: string }) => {
        this.beforePut?.(body.href)
        const found = this.objects.get(body.href)
        if (!found) return error(404, `not_found`)
        if (found.etag !== body.etag) return error(412, `conflict`)
        const etag = this.nextEtag()
        this.objects.set(body.href, { ...found, etag, ics: body.ics })
        return Response.json({ href: body.href, etag })
      })
    }
    if (url.pathname === CALDAV_PATHS.object && request.method === `DELETE`) {
      return request.json().then((body: { href: string; etag: string }) => {
        const found = this.objects.get(body.href)
        if (!found) return error(404, `not_found`)
        if (found.etag !== body.etag) return error(412, `conflict`)
        this.objects.delete(body.href)
        return new Response(null, { status: 204 })
      })
    }
    return error(404, `not_found`)
  }
}

/** An error body in the contract's shape. */
export function error(status: number, code: string, message = `Message for ${code}`): Response {
  return Response.json({ code, message }, { status })
}

let databases = 0

const browserEvents = new Map<string, () => void>()

/** Fires the browser's `offline` (false) or `online` (true) event inside {@link withApp}. */
export function setBrowserOnline(online: boolean): void {
  browserEvents.get(online ? `online` : `offline`)!()
}

/**
 * Runs `test` with `fetch` answered by a fresh {@link FakeServer}, an empty IndexedDB (a fake one,
 * named per test) and every store reset, and undoes all of it afterwards.
 */
export async function withApp(test: (server: FakeServer) => Promise<void>): Promise<void> {
  const server = new FakeServer()
  const own = globalThis.fetch
  globalThis.fetch = (input, init) =>
    Promise.resolve(
      server.handle(new Request(new URL(String(input), `http://app.localhost`), init)),
    )
  useStorage(createDexieStorage(`test-${++databases}`))
  reset()
  const stopWatching = connection.watch({
    addEventListener: (type, listener) => void browserEvents.set(type, listener),
    removeEventListener: (type) => void browserEvents.delete(type),
  })
  try {
    await test(server)
  } finally {
    stopWatching()
    globalThis.fetch = own
    useStorage(undefined)
    reset()
  }
}

function reset(): void {
  resetConnection()
  calendars.value = []
  calendarsLoaded.value = false
  tasks.value = []
  lastSyncedAt.value = null
  cacheUnavailable.value = false
}
