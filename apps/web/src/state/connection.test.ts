/// <reference lib="deno.ns" />
import "fake-indexeddb/auto"
import { expect } from "@std/expect"
import { CALDAV_PATHS, calendarListSchema } from "@api/caldav.ts"
import {
  browserOnline,
  type ConnectionTarget,
  notice,
  offline,
  OFFLINE_NOTICE,
  relay,
  serverProblem,
  ServerProblemKind,
  watchConnection,
} from "./connection.ts"
import { error, withApp } from "./testing.ts"

function fakeTarget() {
  const listeners = new Map<string, () => void>()
  const target: ConnectionTarget = {
    addEventListener: (type, listener) => void listeners.set(type, listener),
    removeEventListener: (type) => void listeners.delete(type),
  }
  return { target, listeners }
}

Deno.test(`the offline notice follows the browser's offline and online events`, async () => {
  await withApp(() => {
    const { target, listeners } = fakeTarget()
    const stop = watchConnection(target)
    expect(notice.value).toBeNull()
    listeners.get(`offline`)!()
    expect(offline.value).toBe(true)
    expect(notice.value).toBe(OFFLINE_NOTICE)
    listeners.get(`online`)!()
    expect(notice.value).toBeNull()
    stop()
    expect(listeners.size).toBe(0)
    return Promise.resolve()
  })
})

Deno.test(`a request that gets no answer shows the offline notice until one succeeds`, async () => {
  await withApp(async (server) => {
    server.down = true
    const lost = await relay(CALDAV_PATHS.calendars, {}, calendarListSchema)
    expect(lost.ok).toBe(false)
    expect(!lost.ok && lost.offline).toBe(true)
    expect(notice.value).toBe(OFFLINE_NOTICE)
    server.down = false
    const back = await relay(CALDAV_PATHS.calendars, {}, calendarListSchema)
    expect(back.ok).toBe(true)
    expect(notice.value).toBeNull()
  })
})

Deno.test(`a refused CalDAV account shows its status and never the server's message`, async () => {
  await withApp(async (server) => {
    server.next = error(502, `caldav_refused`, `Basic hunter2 rejected`)
    await relay(CALDAV_PATHS.calendars, {}, calendarListSchema)
    expect(serverProblem.value).toEqual({ kind: ServerProblemKind.Refused, status: 502 })
    expect(notice.value).toBe(
      `CalDAV server refused the credentials (502): check the server settings`,
    )
    expect(notice.value).not.toContain(`hunter2`)
  })
})

Deno.test(`an unreachable CalDAV server shows its status, and the next good answer clears it`, async () => {
  await withApp(async (server) => {
    server.next = error(503, `caldav_unreachable`)
    await relay(CALDAV_PATHS.calendars, {}, calendarListSchema)
    expect(notice.value).toBe(`CalDAV server unreachable (503): showing your last copy`)
    await relay(CALDAV_PATHS.calendars, {}, calendarListSchema)
    expect(notice.value).toBeNull()
  })
})

Deno.test(`offline wins over a server problem in the notice`, async () => {
  await withApp(async (server) => {
    server.next = error(503, `caldav_unreachable`)
    await relay(CALDAV_PATHS.calendars, {}, calendarListSchema)
    browserOnline.value = false
    expect(notice.value).toBe(OFFLINE_NOTICE)
  })
})

Deno.test(`a success body that does not match the schema is a failure, not data`, async () => {
  await withApp(async (server) => {
    server.next = Response.json({ calendars: `nope` })
    const result = await relay(CALDAV_PATHS.calendars, {}, calendarListSchema)
    expect(result.ok).toBe(false)
  })
})
