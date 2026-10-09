/// <reference lib="deno.ns" />
// A helper for the relay's tests, not a test file: an in-memory CalDAV account and a signed-in app.
// It carries the `.test.ts` suffix so it stays out of the server's build like the tests it serves.
import { expect } from "@std/expect"
import { fromFileUrl } from "@std/path"
import type { Hono } from "hono"
import {
  type CalDavCalendar,
  type CalDavClient,
  type CalDavError,
  CalDavErrorCode,
  type CalDavResult,
  type NewCalendar,
} from "@spy4x/caldav"
import { AUTH_PATHS } from "@api/auth.ts"
import { createApp } from "../app.ts"
import { TEST_CONFIG, TEST_OWNER_PASSWORD } from "../test-config.ts"

export const STATIC_ROOT = fromFileUrl(new URL("../testdata", import.meta.url))
export const ORIGIN = new URL(TEST_CONFIG.PUBLIC_URL).origin
export const DAV = new URL(TEST_CONFIG.CALDAV_URL).origin
export const HOME = `${DAV}/test-user/`
export const TASKS = "/test-user/tasks/"
export const EVENTS = "/test-user/events/"
export const OPEN = `${TASKS}open.ics`
export const DONE = `${TASKS}done.ics`
export const OPEN_ICS =
  "BEGIN:VCALENDAR\r\nBEGIN:VTODO\r\nUID:open\r\nEND:VTODO\r\nEND:VCALENDAR\r\n"
export const DONE_ICS =
  "BEGIN:VCALENDAR\r\nBEGIN:VTODO\r\nUID:done\r\nCOMPLETED:20261008T090000Z\r\nEND:VTODO\r\nEND:VCALENDAR\r\n"

/** Every CalDavErrorCode: the enum is numeric, so its values hold its names too. */
export const CODES = Object.values(CalDavErrorCode).filter((value): value is CalDavErrorCode =>
  typeof value === "number"
)

/** One call the relay made to the CalDAV client: the method and its arguments. */
export type Call = [string, ...unknown[]]

/**
 * An in-memory CalDAV account for the relay to talk to: one home with a task list and an event
 * calendar. It records every call, so a test can tell whether a request would have left the server.
 */
export class FakeCalDav implements CalDavClient {
  calls: Call[] = []
  calendars: CalDavCalendar[] = [
    {
      url: `${DAV}${TASKS}`,
      displayName: "Tasks",
      components: ["VTODO"],
      color: "#3366FFFF",
      ctag: "ctag-1",
    },
    { url: `${DAV}${EVENTS}`, displayName: "Events", components: ["VEVENT"] },
  ]
  objects = new Map<string, { etag: string | null; data: string }>([
    [`${DAV}${OPEN}`, { etag: `"e-open"`, data: OPEN_ICS }],
    [`${DAV}${DONE}`, { etag: `W/"e-done"`, data: DONE_ICS }],
  ])
  /** When set, every call after discovery and listing fails with this. */
  failWith: CalDavError | null = null
  /** When set, discovery fails with this. */
  discoverFails: CalDavError | null = null
  private version = 0

  private record<T>(call: Call, run: () => CalDavResult<T>): Promise<CalDavResult<T>> {
    this.calls.push(call)
    if (this.failWith && !["discover", "listCalendars"].includes(call[0])) {
      return Promise.resolve({ success: false, output: null, error: this.failWith })
    }
    return Promise.resolve(run())
  }

  discover() {
    return this.record(
      ["discover"],
      () =>
        this.discoverFails
          ? { success: false as const, output: null, error: this.discoverFails }
          : ok({ principalUrl: HOME, homeUrls: [HOME] }),
    )
  }
  listCalendars(home: string | URL) {
    return this.record(["listCalendars", String(home)], () => ok(this.calendars))
  }
  listObjects(calendar: string | URL, options: { component: string; includeCompleted?: boolean }) {
    return this.record(["listObjects", String(calendar), options], () =>
      ok(
        [...this.objects]
          .filter(([url, object]) =>
            url.startsWith(String(calendar)) &&
            (options.includeCompleted || !object.data.includes("COMPLETED:"))
          )
          .map(([url, object]) => ({ url, ...object })),
      ))
  }
  getObjects(): Promise<never> {
    throw new Error("not used by the relay")
  }
  getObject(url: string | URL) {
    return this.record(["getObject", String(url)], () => {
      const object = this.objects.get(String(url))
      return object ? ok({ url: String(url), ...object }) : fail(CalDavErrorCode.NotFound)
    })
  }
  createObject(calendar: string | URL, ics: string, options?: { name?: string }) {
    const name = options?.name
    const call: Call = name === undefined
      ? ["createObject", String(calendar), ics]
      : ["createObject", String(calendar), ics, name]
    return this.record(call, () => {
      // The real client refuses a name that is not a plain file name.
      if (name !== undefined && !/^[A-Za-z0-9._~-]+$/.test(name)) {
        return fail(CalDavErrorCode.InvalidArgument)
      }
      if (name !== undefined && this.objects.has(`${calendar}${name}`)) {
        return fail(CalDavErrorCode.AlreadyExists)
      }
      const url = name === undefined ? `${calendar}new-${++this.version}.ics` : `${calendar}${name}`
      const etag = `"e-${this.version}"`
      this.objects.set(url, { etag, data: ics })
      return ok({ url, etag })
    })
  }
  updateObject(url: string | URL, ics: string, etag: string) {
    return this.record(["updateObject", String(url), ics, etag], () => {
      const object = this.objects.get(String(url))
      if (!object) return fail(CalDavErrorCode.NotFound)
      if (object.etag !== etag) return fail(CalDavErrorCode.Conflict)
      const next = { etag: `"e-${++this.version}"`, data: ics }
      this.objects.set(String(url), next)
      return ok({ url: String(url), etag: next.etag })
    })
  }
  deleteObject(url: string | URL, etag: string) {
    return this.record(["deleteObject", String(url), etag], () => {
      const object = this.objects.get(String(url))
      if (!object) return fail(CalDavErrorCode.NotFound)
      if (object.etag !== etag) return fail(CalDavErrorCode.Conflict)
      this.objects.delete(String(url))
      return ok(null)
    })
  }
  makeCalendar(home: string | URL, calendar: NewCalendar) {
    return this.record(["makeCalendar", String(home), calendar], () => {
      const url = `${home}list-${++this.version}/`
      this.calendars.push({
        url,
        displayName: calendar.displayName,
        components: calendar.components,
        ...(calendar.color === undefined ? {} : { color: calendar.color }),
      })
      return ok({ url })
    })
  }
  updateCalendar(url: string | URL, changes: { displayName?: string; color?: string }) {
    return this.record(["updateCalendar", String(url), changes], () => {
      const calendar = this.calendars.find((candidate) => candidate.url === String(url))
      if (!calendar) return fail(CalDavErrorCode.NotFound)
      Object.assign(calendar, changes)
      return ok(null)
    })
  }
  deleteCalendar(url: string | URL) {
    return this.record(["deleteCalendar", String(url)], () => {
      const index = this.calendars.findIndex((candidate) => candidate.url === String(url))
      if (index === -1) return fail(CalDavErrorCode.NotFound)
      this.calendars.splice(index, 1)
      for (const object of [...this.objects.keys()]) {
        if (object.startsWith(String(url))) this.objects.delete(object)
      }
      return ok(null)
    })
  }

  /** The calls that touch a calendar's contents, as opposed to discovery and listing calendars. */
  objectCalls(): Call[] {
    return this.calls.filter(([method]) => method !== "discover" && method !== "listCalendars")
  }
}

export function ok<T>(output: T): CalDavResult<T> {
  return { success: true, output, error: null }
}

export function fail(code: CalDavErrorCode): CalDavResult<never> {
  return { success: false, output: null, error: { code, message: CalDavErrorCode[code] } }
}

export interface Setup {
  app: Hono
  dav: FakeCalDav
  /** Sends a request as the signed-in owner's page would. */
  send: (path: string, init?: SendInit) => Promise<Response>
}

export interface SendInit {
  method?: string
  /** Sent as JSON. */
  body?: unknown
  /** Sent as is, with a JSON content type. */
  raw?: string
  /** The content type of a body; `null` sends none. Default: JSON. */
  contentType?: string | null
  /** Replace the same-origin headers the owner's page sends. */
  headers?: Record<string, string>
}

/** A fresh app with its own fake CalDAV account and a signed-in session. */
export async function setup(): Promise<Setup> {
  const dav = new FakeCalDav()
  const app = await createApp(TEST_CONFIG, { staticRoot: STATIC_ROOT, caldav: { client: dav } })
  const signIn = await app.request(AUTH_PATHS.signIn, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
    },
    body: JSON.stringify({ password: TEST_OWNER_PASSWORD }),
  })
  expect(signIn.status).toBe(204)
  const cookie = (signIn.headers.get("set-cookie") ?? "").split(";")[0]
  const send: Setup["send"] = async (path, init = {}) => {
    const headers = new Headers({
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
      ...init.headers,
      cookie,
    })
    const body = init.raw ?? (init.body === undefined ? undefined : JSON.stringify(init.body))
    if (body !== undefined && init.contentType !== null) {
      headers.set("content-type", init.contentType ?? "application/json")
    }
    return await app.request(path, { method: init.method ?? "GET", headers, body })
  }
  return { app, dav, send }
}
