/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { CalDavErrorCode } from "@spy4x/caldav"
import { CALDAV_PATHS } from "@api/caldav.ts"
import { DAV, EVENTS, HOME, OPEN, ORIGIN, setup, TASKS } from "./fake-caldav.test.ts"

/** The calls that change a calendar. */
const ADMIN = ["makeCalendar", "updateCalendar", "deleteCalendar"]

Deno.test("refuses every list route without a session and calls the CalDAV server for none", async () => {
  const { app, dav } = await setup()
  const requests: [string, string, unknown][] = [
    ["POST", CALDAV_PATHS.calendars, { displayName: "Shopping" }],
    ["PATCH", CALDAV_PATHS.calendar, { href: TASKS, displayName: "Renamed" }],
    ["DELETE", CALDAV_PATHS.calendar, { href: TASKS }],
  ]
  for (const [method, path, body] of requests) {
    const response = await app.request(path, {
      method,
      headers: {
        origin: ORIGIN,
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    })
    expect([method, response.status]).toEqual([method, 401])
    expect((await response.json()).code).toBe("unauthorized")
  }
  expect(dav.calls).toEqual([])
})

Deno.test("refuses a cross-site list write even with a session", async () => {
  const { dav, send } = await setup()
  for (const method of ["POST", "PATCH", "DELETE"]) {
    const response = await send(
      method === "POST" ? CALDAV_PATHS.calendars : CALDAV_PATHS.calendar,
      {
        method,
        body: method === "POST" ? { displayName: "Shopping" } : { href: TASKS },
        headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
      },
    )
    expect([method, response.status]).toEqual([method, 403])
    await response.body?.cancel()
  }
  expect(dav.calls).toEqual([])
})

Deno.test("creates a task-only list in the account's home with the colour as Tasks.org writes it", async () => {
  const { dav, send } = await setup()
  const response = await send(CALDAV_PATHS.calendars, {
    method: "POST",
    body: { displayName: "  Shopping ", color: "#e07a5f" },
  })
  expect(response.status).toBe(201)
  const { href } = await response.json()
  expect(dav.calls.filter(([method]) => method === "makeCalendar")).toEqual([
    ["makeCalendar", HOME, {
      displayName: "Shopping",
      components: ["VTODO"],
      color: "#E07A5FFF",
    }],
  ])
  const listed = await send(CALDAV_PATHS.calendars)
  const { calendars } = await listed.json()
  expect(calendars.find((calendar: { href: string }) => calendar.href === href)).toMatchObject({
    displayName: "Shopping",
    color: "#E07A5FFF",
  })
})

Deno.test("creates a list without a colour when none is sent", async () => {
  const { dav, send } = await setup()
  const response = await send(CALDAV_PATHS.calendars, {
    method: "POST",
    body: { displayName: "Plain" },
  })
  expect(response.status).toBe(201)
  await response.body?.cancel()
  const [, , calendar] = dav.calls.find(([method]) => method === "makeCalendar")!
  expect(calendar).toEqual({ displayName: "Plain", components: ["VTODO"] })
})

Deno.test("renames and recolours a listed list, sending only what changed", async () => {
  const { dav, send } = await setup()
  const both = await send(CALDAV_PATHS.calendar, {
    method: "PATCH",
    body: { href: TASKS, displayName: "Errands ", color: "#81b29a" },
  })
  expect(both.status).toBe(204)
  const colour = await send(CALDAV_PATHS.calendar, {
    method: "PATCH",
    body: { href: TASKS, color: "#3d405b" },
  })
  expect(colour.status).toBe(204)
  expect(dav.calls.filter(([method]) => method === "updateCalendar")).toEqual([
    ["updateCalendar", `${DAV}${TASKS}`, { displayName: "Errands", color: "#81B29AFF" }],
    ["updateCalendar", `${DAV}${TASKS}`, { color: "#3D405BFF" }],
  ])
})

Deno.test("deletes a listed list, then refuses its tasks without asking the CalDAV server", async () => {
  const { dav, send } = await setup()
  const response = await send(CALDAV_PATHS.calendar, { method: "DELETE", body: { href: TASKS } })
  expect(response.status).toBe(204)
  expect(dav.calls.filter(([method]) => ADMIN.includes(method))).toEqual([
    ["deleteCalendar", `${DAV}${TASKS}`],
  ])
  const after = await send(`${CALDAV_PATHS.object}?href=${encodeURIComponent(OPEN)}`)
  expect(after.status).toBe(400)
  await after.body?.cancel()
  expect(dav.calls.some(([method]) => method === "getObject")).toBe(false)
})

Deno.test("refuses an href outside the user's lists before any request names it", async () => {
  const { dav, send } = await setup()
  const outside = [
    // Not canonical: refused without listing anything.
    `${DAV}${TASKS}`,
    `https://evil.example${TASKS}`,
    `//evil.example${TASKS}`,
    `${TASKS}../events/`,
    `${TASKS}%2e%2e/`,
    // Canonical, but not a task list this account lists.
    "/other-user/tasks/",
    "/test-user/",
    "/",
    EVENTS,
    OPEN,
  ]
  for (const href of outside) {
    for (
      const [method, body] of [
        ["PATCH", { href, displayName: "Taken over" }],
        ["DELETE", { href }],
      ] as const
    ) {
      const response = await send(CALDAV_PATHS.calendar, { method, body })
      expect([href, method, response.status]).toEqual([href, method, 400])
      expect((await response.json()).code).toBe("bad_request")
    }
  }
  expect(dav.calls.filter(([method]) => ADMIN.includes(method))).toEqual([])
})

Deno.test("refuses a blank name, a colour that is not #rrggbb and an empty change before calling CalDAV", async () => {
  const { dav, send } = await setup()
  const requests: [string, string, unknown][] = [
    ["POST", CALDAV_PATHS.calendars, { displayName: "   " }],
    ["POST", CALDAV_PATHS.calendars, { displayName: "x".repeat(256) }],
    ["POST", CALDAV_PATHS.calendars, { displayName: "Ok", color: "red" }],
    ["POST", CALDAV_PATHS.calendars, { displayName: "Ok", color: "#e07a5fff" }],
    ["POST", CALDAV_PATHS.calendars, { displayName: "Ok", href: TASKS }],
    ["PATCH", CALDAV_PATHS.calendar, { href: TASKS }],
    ["PATCH", CALDAV_PATHS.calendar, { href: TASKS, displayName: "" }],
    ["PATCH", CALDAV_PATHS.calendar, { href: TASKS, color: "#12345" }],
    ["DELETE", CALDAV_PATHS.calendar, {}],
  ]
  for (const [method, path, body] of requests) {
    const response = await send(path, { method, body })
    expect([method, body, response.status]).toEqual([method, body, 400])
    await response.body?.cancel()
  }
  expect(dav.calls).toEqual([])
})

Deno.test("answers a CalDAV failure of a list write with its documented status and no upstream text", async () => {
  const { dav, send } = await setup()
  dav.failWith = { code: CalDavErrorCode.Forbidden, message: "upstream detail", status: 403 }
  const requests: [string, string, unknown][] = [
    ["POST", CALDAV_PATHS.calendars, { displayName: "Shopping" }],
    ["PATCH", CALDAV_PATHS.calendar, { href: TASKS, displayName: "Renamed" }],
    ["DELETE", CALDAV_PATHS.calendar, { href: TASKS }],
  ]
  for (const [method, path, body] of requests) {
    const response = await send(path, { method, body })
    const answer = await response.json()
    expect([method, response.status, answer.code]).toEqual([method, 502, "caldav_refused"])
    expect(answer.message).not.toContain("upstream detail")
  }
})
