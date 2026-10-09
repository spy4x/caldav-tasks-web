/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { fromFileUrl } from "@std/path"
import type { Hono } from "hono"
import {
  type CalDavCalendar,
  type CalDavClient,
  type CalDavError,
  CalDavErrorCode,
  type CalDavResult,
} from "@spy4x/caldav"
import { AUTH_PATHS } from "@api/auth.ts"
import { CALDAV_MAX_REQUEST_BYTES, CALDAV_PATHS } from "@api/caldav.ts"
import { createApp } from "../app.ts"
import { TEST_CONFIG, TEST_OWNER_PASSWORD } from "../test-config.ts"

const STATIC_ROOT = fromFileUrl(new URL("../testdata", import.meta.url))
const ORIGIN = new URL(TEST_CONFIG.PUBLIC_URL).origin
const DAV = new URL(TEST_CONFIG.CALDAV_URL).origin
const HOME = `${DAV}/test-user/`
const TASKS = "/test-user/tasks/"
const EVENTS = "/test-user/events/"
const OPEN = `${TASKS}open.ics`
const DONE = `${TASKS}done.ics`
const OPEN_ICS = "BEGIN:VCALENDAR\r\nBEGIN:VTODO\r\nUID:open\r\nEND:VTODO\r\nEND:VCALENDAR\r\n"
const DONE_ICS =
  "BEGIN:VCALENDAR\r\nBEGIN:VTODO\r\nUID:done\r\nCOMPLETED:20261008T090000Z\r\nEND:VTODO\r\nEND:VCALENDAR\r\n"

/** Every CalDavErrorCode: the enum is numeric, so its values hold its names too. */
const CODES = Object.values(CalDavErrorCode).filter((value): value is CalDavErrorCode =>
  typeof value === "number"
)

/** One call the relay made to the CalDAV client: the method and its arguments. */
type Call = [string, ...unknown[]]

/**
 * An in-memory CalDAV account for the relay to talk to: one home with a task list and an event
 * calendar. It records every call, so a test can tell whether a request would have left the server.
 */
class FakeCalDav implements CalDavClient {
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
  objects = new Map<string, { etag: string; data: string }>([
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
  createObject(calendar: string | URL, ics: string) {
    return this.record(["createObject", String(calendar), ics], () => {
      const url = `${calendar}new-${++this.version}.ics`
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
  makeCalendar(): Promise<never> {
    throw new Error("not used by the relay")
  }
  updateCalendar(): Promise<never> {
    throw new Error("not used by the relay")
  }
  deleteCalendar(): Promise<never> {
    throw new Error("not used by the relay")
  }

  /** The calls that touch a calendar's contents, as opposed to discovery and listing calendars. */
  objectCalls(): Call[] {
    return this.calls.filter(([method]) => method !== "discover" && method !== "listCalendars")
  }
}

function ok<T>(output: T): CalDavResult<T> {
  return { success: true, output, error: null }
}

function fail(code: CalDavErrorCode): CalDavResult<never> {
  return { success: false, output: null, error: { code, message: CalDavErrorCode[code] } }
}

interface Setup {
  app: Hono
  dav: FakeCalDav
  /** Sends a request as the signed-in owner's page would. */
  send: (path: string, init?: SendInit) => Promise<Response>
}

interface SendInit {
  method?: string
  /** Sent as JSON. */
  body?: unknown
  /** Sent as is, with a JSON content type. */
  raw?: string
  /** Replace the same-origin headers the owner's page sends. */
  headers?: Record<string, string>
}

/** A fresh app with its own fake CalDAV account and a signed-in session. */
async function setup(): Promise<Setup> {
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
    if (body !== undefined) headers.set("content-type", "application/json")
    return await app.request(path, { method: init.method ?? "GET", headers, body })
  }
  return { app, dav, send }
}

function objectPath(href: string): string {
  return `${CALDAV_PATHS.object}?href=${encodeURIComponent(href)}`
}

function objectsPath(calendar: string, completed?: string): string {
  const query = new URLSearchParams({ calendar })
  if (completed !== undefined) query.set("completed", completed)
  return `${CALDAV_PATHS.objects}?${query}`
}

Deno.test("refuses every CalDAV route without a session and calls the CalDAV server for none", async () => {
  const { app, dav } = await setup()
  const requests: [string, string][] = [
    ["GET", CALDAV_PATHS.calendars],
    ["GET", objectsPath(TASKS)],
    ["GET", objectPath(OPEN)],
    ["POST", CALDAV_PATHS.objects],
    ["PUT", CALDAV_PATHS.object],
    ["DELETE", CALDAV_PATHS.object],
  ]
  for (const [method, path] of requests) {
    const response = await app.request(path, {
      method,
      headers: { origin: ORIGIN, "sec-fetch-site": "same-origin" },
    })
    expect([method, path, response.status]).toEqual([method, path, 401])
    expect((await response.json()).code).toBe("unauthorized")
  }
  expect(dav.calls).toEqual([])
})

Deno.test("refuses a cross-site write even with a session", async () => {
  const { dav, send } = await setup()
  for (const method of ["POST", "PUT", "DELETE"]) {
    const response = await send(method === "POST" ? CALDAV_PATHS.objects : CALDAV_PATHS.object, {
      method,
      body: { calendar: TASKS, href: OPEN, etag: `"e-open"`, ics: OPEN_ICS },
      headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    })
    expect([method, response.status]).toEqual([method, 403])
    await response.body?.cancel()
  }
  expect(dav.calls).toEqual([])
})

Deno.test("lists only the calendars that can hold tasks, with colour and change marker", async () => {
  const { send } = await setup()
  const response = await send(CALDAV_PATHS.calendars)
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    calendars: [{
      href: TASKS,
      displayName: "Tasks",
      color: "#3366FFFF",
      components: ["VTODO"],
      changeMarker: "ctag-1",
    }],
  })
})

Deno.test("lists a calendar's open tasks by default and completed ones on request", async () => {
  const { send } = await setup()
  const open = await send(objectsPath(TASKS))
  expect(open.status).toBe(200)
  expect(await open.json()).toEqual({ objects: [{ href: OPEN, etag: `"e-open"`, ics: OPEN_ICS }] })

  const all = await send(objectsPath(TASKS, "true"))
  expect(await all.json()).toEqual({
    objects: [
      { href: OPEN, etag: `"e-open"`, ics: OPEN_ICS },
      { href: DONE, etag: `W/"e-done"`, ics: DONE_ICS },
    ],
  })

  const wrong = await send(objectsPath(TASKS, "yes"))
  expect(wrong.status).toBe(400)
  await wrong.body?.cancel()
})

Deno.test("gets one task as its href, etag and untouched text", async () => {
  const { send } = await setup()
  const response = await send(objectPath(DONE))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ href: DONE, etag: `W/"e-done"`, ics: DONE_ICS })
})

Deno.test("creates a task in a listed calendar and answers 201 with its href and etag", async () => {
  const { dav, send } = await setup()
  const response = await send(CALDAV_PATHS.objects, {
    method: "POST",
    body: { calendar: TASKS, ics: OPEN_ICS },
  })
  expect(response.status).toBe(201)
  expect(await response.json()).toEqual({ href: `${TASKS}new-1.ics`, etag: `"e-1"` })
  expect(dav.objectCalls()).toEqual([["createObject", `${DAV}${TASKS}`, OPEN_ICS]])
})

Deno.test("passes the browser's etag through exactly on update and delete", async () => {
  const { dav, send } = await setup()
  const update = await send(CALDAV_PATHS.object, {
    method: "PUT",
    body: { href: DONE, etag: `W/"e-done"`, ics: OPEN_ICS },
  })
  expect(update.status).toBe(200)
  expect(await update.json()).toEqual({ href: DONE, etag: `"e-1"` })

  const remove = await send(CALDAV_PATHS.object, {
    method: "DELETE",
    body: { href: DONE, etag: `"e-1"` },
  })
  expect(remove.status).toBe(204)
  expect(dav.objectCalls()).toEqual([
    ["updateObject", `${DAV}${DONE}`, OPEN_ICS, `W/"e-done"`],
    ["deleteObject", `${DAV}${DONE}`, `"e-1"`],
  ])
})

Deno.test("a stale etag answers 412 conflict and leaves the task unchanged", async () => {
  const { dav, send } = await setup()
  for (const method of ["PUT", "DELETE"]) {
    const response = await send(CALDAV_PATHS.object, {
      method,
      body: method === "PUT"
        ? { href: OPEN, etag: `"stale"`, ics: DONE_ICS }
        : { href: OPEN, etag: `"stale"` },
    })
    expect([method, response.status]).toEqual([method, 412])
    expect(await response.json()).toEqual({
      code: "conflict",
      message: "The task changed on the server since it was read",
    })
  }
  expect(dav.objects.get(`${DAV}${OPEN}`)).toEqual({ etag: `"e-open"`, data: OPEN_ICS })
})

Deno.test("refuses an href outside the listed calendars before any request names it", async () => {
  const { dav, send } = await setup()
  const outside = [
    // Not canonical: refused without listing anything.
    `${DAV}${OPEN}`,
    `https://evil.example${OPEN}`,
    `http://test-user:pw@localhost:5232${OPEN}`,
    `//evil.example${OPEN}`,
    `${TASKS}../other/a.ics`,
    `${TASKS}%2e%2e/other/a.ics`,
    `${TASKS}..%2Fother%2Fa.ics`,
    `${TASKS}a%5Cb.ics`,
    // Canonical, but in no listed task calendar.
    "/other-user/tasks/a.ics",
    "/test-user/a.ics",
    `${EVENTS}a.ics`,
    `${TASKS}nested/a.ics`,
  ]
  for (const href of outside) {
    const requests: [string, unknown][] = [
      [objectPath(href), undefined],
      [objectsPath(href), undefined],
      ["PUT", { href, etag: `"e-open"`, ics: OPEN_ICS }],
      ["DELETE", { href, etag: `"e-open"` }],
      ["POST", { calendar: href, ics: OPEN_ICS }],
    ]
    for (const [target, body] of requests) {
      const response = body === undefined
        ? await send(target)
        : await send(target === "POST" ? CALDAV_PATHS.objects : CALDAV_PATHS.object, {
          method: target,
          body,
        })
      expect([href, target, response.status]).toEqual([href, target, 400])
      expect((await response.json()).code).toBe("bad_request")
    }
  }
  // A calendar is not a task.
  for (const method of ["GET", "PUT", "DELETE"]) {
    const response = method === "GET"
      ? await send(objectPath(TASKS))
      : await send(CALDAV_PATHS.object, {
        method,
        body: { href: TASKS, etag: `"e-open"`, ...(method === "PUT" ? { ics: OPEN_ICS } : {}) },
      })
    expect([method, response.status]).toEqual([method, 400])
    await response.body?.cancel()
  }
  expect(dav.objectCalls()).toEqual([])
})

Deno.test("finds a calendar created elsewhere by listing the calendars again", async () => {
  const { dav, send } = await setup()
  const first = await send(CALDAV_PATHS.calendars)
  await first.body?.cancel()
  dav.calendars.push({ url: `${DAV}/test-user/new/`, displayName: "New", components: ["VTODO"] })
  const response = await send(objectsPath("/test-user/new/"))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ objects: [] })
})

Deno.test("relays a calendar whose name holds an encoded slash, as Stalwart lists one", async () => {
  const { dav, send } = await setup()
  const calendar = "/test-user/work%20%2F%20home/"
  dav.calendars.push({
    url: `${DAV}${calendar}`,
    displayName: "Work / Home",
    components: ["VTODO"],
  })
  dav.objects.set(`${DAV}${calendar}a.ics`, { etag: `"e-a"`, data: OPEN_ICS })
  const list = await send(objectsPath(calendar))
  expect(list.status).toBe(200)
  expect(await list.json()).toEqual({
    objects: [{ href: `${calendar}a.ics`, etag: `"e-a"`, ics: OPEN_ICS }],
  })
  const one = await send(objectPath(`${calendar}a.ics`))
  expect(one.status).toBe(200)
  await one.body?.cancel()
})

Deno.test("retries discovery on the next request after it failed", async () => {
  const { dav, send } = await setup()
  dav.discoverFails = { code: CalDavErrorCode.Network, message: "down" }
  const down = await send(CALDAV_PATHS.calendars)
  expect(down.status).toBe(503)
  expect((await down.json()).code).toBe("caldav_unreachable")
  dav.discoverFails = null
  const up = await send(CALDAV_PATHS.calendars)
  expect(up.status).toBe(200)
  await up.body?.cancel()
})

Deno.test("maps each CalDavErrorCode to its documented status and contract code", async () => {
  // The table in libs/api/caldav.ts, written out again so a change to either one fails here.
  const documented: Record<CalDavErrorCode, [number, string]> = {
    [CalDavErrorCode.Conflict]: [412, "conflict"],
    [CalDavErrorCode.NotFound]: [404, "not_found"],
    [CalDavErrorCode.Unauthorized]: [502, "caldav_refused"],
    [CalDavErrorCode.Forbidden]: [502, "caldav_refused"],
    [CalDavErrorCode.CrossOriginRedirect]: [502, "caldav_failed"],
    [CalDavErrorCode.OutsideServer]: [502, "caldav_failed"],
    [CalDavErrorCode.AlreadyExists]: [409, "already_exists"],
    [CalDavErrorCode.UidConflict]: [409, "uid_conflict"],
    [CalDavErrorCode.InvalidArgument]: [400, "bad_request"],
    [CalDavErrorCode.TooLarge]: [413, "too_large"],
    [CalDavErrorCode.Malformed]: [502, "caldav_failed"],
    [CalDavErrorCode.Network]: [503, "caldav_unreachable"],
    [CalDavErrorCode.Timeout]: [504, "caldav_unreachable"],
    [CalDavErrorCode.TooManyRedirects]: [502, "caldav_failed"],
    [CalDavErrorCode.Server]: [502, "caldav_failed"],
  }
  const { dav, send } = await setup()
  for (const code of CODES) {
    dav.failWith = { code, message: "upstream detail", status: 500 }
    const response = await send(objectPath(OPEN))
    const body = await response.json()
    expect([code, response.status, body.code]).toEqual([code, ...documented[code]])
    expect(body.message).not.toContain("upstream detail")
  }
})

Deno.test("refuses a body over 1 MiB, a non-JSON body and an invalid one before calling CalDAV", async () => {
  const { dav, send } = await setup()
  const big = await send(CALDAV_PATHS.objects, {
    method: "POST",
    body: { calendar: TASKS, ics: "x".repeat(CALDAV_MAX_REQUEST_BYTES) },
  })
  expect(big.status).toBe(413)
  expect((await big.json()).code).toBe("too_large")

  const invalid = await send(CALDAV_PATHS.object, {
    method: "PUT",
    body: { href: OPEN, ics: OPEN_ICS },
  })
  expect(invalid.status).toBe(400)
  await invalid.body?.cancel()

  const extra = await send(CALDAV_PATHS.object, {
    method: "DELETE",
    body: { href: OPEN, etag: `"e-open"`, force: true },
  })
  expect(extra.status).toBe(400)
  await extra.body?.cancel()

  const broken = await send(CALDAV_PATHS.objects, { method: "POST", raw: "{" })
  expect(broken.status).toBe(400)
  await broken.body?.cancel()
  expect(dav.objectCalls()).toEqual([])
})

Deno.test("no response body and no log line contains CALDAV_PASSWORD", async () => {
  const password = TEST_CONFIG.CALDAV_PASSWORD
  const lines: string[] = []
  const originals = { ...console }
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    console[level] = (...args: unknown[]) => lines.push(args.map(String).join(" "))
  }
  const bodies: string[] = []
  try {
    const { dav, send } = await setup()
    const sendAll = async () => {
      for (
        const [path, init] of [
          [CALDAV_PATHS.calendars, {}],
          [objectsPath(TASKS, "true"), {}],
          [objectPath(OPEN), {}],
          [CALDAV_PATHS.objects, { method: "POST", body: { calendar: TASKS, ics: OPEN_ICS } }],
          [CALDAV_PATHS.object, {
            method: "PUT",
            body: { href: OPEN, etag: `"x"`, ics: OPEN_ICS },
          }],
          [CALDAV_PATHS.object, { method: "DELETE", body: { href: OPEN, etag: `"x"` } }],
        ] as const
      ) {
        bodies.push(await (await send(path, init)).text())
      }
    }
    await sendAll()
    // A CalDAV server that echoes the credentials into every failure, with each code.
    for (const code of CODES) {
      dav.failWith = {
        code,
        message: `Basic ${btoa(`test-user:${password}`)} ${password}`,
        status: 500,
        condition: password,
        target: `http://test-user:${password}@evil.example/`,
      }
      await sendAll()
    }
    // A client that throws with the password in the error.
    dav.failWith = null
    dav.getObject = () => Promise.reject(new Error(`boom ${password}`))
    bodies.push(await (await send(objectPath(OPEN))).text())
  } finally {
    Object.assign(console, originals)
  }
  // Six routes, once working and once per failure code, then the throwing client.
  expect(bodies.length).toBe(6 * (1 + CODES.length) + 1)
  expect(lines.length).toBeGreaterThanOrEqual(CODES.length)
  for (const text of [...bodies, ...lines]) expect(text).not.toContain(password)
  expect(lines.some((line) => line.includes("getObject threw Error"))).toBe(true)
})
