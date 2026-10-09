/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { CalDavErrorCode } from "@spy4x/caldav"
import { CALDAV_MAX_REQUEST_BYTES, CALDAV_PATHS } from "@api/caldav.ts"
import { REQUEST_TOO_LARGE } from "./routes.ts"
import { TEST_CONFIG } from "../test-config.ts"
import {
  CODES,
  DAV,
  DONE,
  DONE_ICS,
  EVENTS,
  OPEN,
  OPEN_ICS,
  ORIGIN,
  setup,
  TASKS,
} from "./fake-caldav.test.ts"

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

Deno.test("creates a task under the file name the browser asked for, and answers 409 when it is taken", async () => {
  const { dav, send } = await setup()
  const body = { calendar: TASKS, ics: OPEN_ICS, name: "abc-1.ics" }
  const first = await send(CALDAV_PATHS.objects, { method: "POST", body })
  expect(first.status).toBe(201)
  expect((await first.json()).href).toBe(`${TASKS}abc-1.ics`)
  const again = await send(CALDAV_PATHS.objects, { method: "POST", body })
  expect(again.status).toBe(409)
  expect((await again.json()).code).toBe("already_exists")
  expect(dav.objectCalls()).toEqual([
    ["createObject", `${DAV}${TASKS}`, OPEN_ICS, "abc-1.ics"],
    ["createObject", `${DAV}${TASKS}`, OPEN_ICS, "abc-1.ics"],
  ])
})

Deno.test("answers 400 for a file name the CalDAV client refuses", async () => {
  const { dav, send } = await setup()
  const response = await send(CALDAV_PATHS.objects, {
    method: "POST",
    body: { calendar: TASKS, ics: OPEN_ICS, name: "../x.ics" },
  })
  expect(response.status).toBe(400)
  expect(dav.objects.size).toBe(2)
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
  expect(await big.json()).toEqual({ code: "too_large", message: REQUEST_TOO_LARGE })

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

Deno.test("refuses a write without a JSON content type with 415 before calling CalDAV", async () => {
  const { dav, send } = await setup()
  const writes: [string, string, unknown][] = [
    ["POST", CALDAV_PATHS.objects, { calendar: TASKS, ics: OPEN_ICS }],
    ["PUT", CALDAV_PATHS.object, { href: OPEN, etag: `"e-open"`, ics: OPEN_ICS }],
    ["DELETE", CALDAV_PATHS.object, { href: OPEN, etag: `"e-open"` }],
  ]
  for (const [method, path, body] of writes) {
    for (const contentType of ["text/plain", null]) {
      const response = await send(path, { method, body, contentType })
      expect([method, contentType, response.status]).toEqual([method, contentType, 415])
      expect((await response.json()).code).toBe("bad_request")
    }
  }
  expect(dav.calls).toEqual([])
})

Deno.test("lists and relays a calendar that does not say which components it accepts", async () => {
  const { dav, send } = await setup()
  const calendar = "/test-user/any/"
  dav.calendars.push({ url: `${DAV}${calendar}`, displayName: "Any", components: [] })
  dav.objects.set(`${DAV}${calendar}a.ics`, { etag: `"e-a"`, data: OPEN_ICS })
  const listed = await send(CALDAV_PATHS.calendars)
  expect((await listed.json()).calendars).toContainEqual({
    href: calendar,
    displayName: "Any",
    components: [],
  })
  const objects = await send(objectsPath(calendar))
  expect(objects.status).toBe(200)
  expect(await objects.json()).toEqual({
    objects: [{ href: `${calendar}a.ics`, etag: `"e-a"`, ics: OPEN_ICS }],
  })
})

Deno.test("relays a task the server sent without an etag as etag null", async () => {
  const { dav, send } = await setup()
  dav.objects.set(`${DAV}${OPEN}`, { etag: null, data: OPEN_ICS })
  const one = await send(objectPath(OPEN))
  expect(one.status).toBe(200)
  expect(await one.json()).toEqual({ href: OPEN, etag: null, ics: OPEN_ICS })
  const list = await send(objectsPath(TASKS))
  expect(await list.json()).toEqual({ objects: [{ href: OPEN, etag: null, ics: OPEN_ICS }] })
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
