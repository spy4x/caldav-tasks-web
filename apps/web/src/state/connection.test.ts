/// <reference lib="deno.ns" />
import "fake-indexeddb/auto"
import { expect } from "@std/expect"
import { CALDAV_PATHS, calendarListSchema } from "@api/caldav.ts"
import {
  notice,
  OFFLINE_NOTICE,
  relay,
  resetConnection,
  serverProblem,
  ServerProblemKind,
} from "./connection.ts"
import { ApiErrorCode } from "@api/errors.ts"
import { error, setBrowserOnline, withApp } from "./testing.ts"

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
    setBrowserOnline(false)
    expect(notice.value).toBe(OFFLINE_NOTICE)
  })
})

Deno.test(`a success body that does not match the schema is a failure, not data`, async () => {
  await withApp(async (server) => {
    server.next = Response.json({ calendars: `nope` })
    const result = await relay(CALDAV_PATHS.calendars, {}, calendarListSchema)
    expect(result).toEqual({
      ok: false,
      status: 200,
      code: ApiErrorCode.CalDavFailed,
      message: `The server sent an unusable reply.`,
      offline: false,
    })
  })
})

Deno.test(`a reply that fails its schema clears an earlier CalDAV server problem`, async () => {
  await withApp(async (server) => {
    server.next = error(503, `caldav_unreachable`)
    await relay(CALDAV_PATHS.calendars, {}, calendarListSchema)
    expect(serverProblem.value).not.toBeNull()
    server.next = Response.json({ calendars: `nope` })
    await relay(CALDAV_PATHS.calendars, {}, calendarListSchema)
    expect(serverProblem.value).toBeNull()
  })
})

Deno.test(`a server that sends the library's invalid-reply code itself is a failure with no code`, async () => {
  await withApp(async (server) => {
    server.next = error(502, `invalid_reply`, `Basic hunter2 rejected`)
    const result = await relay(CALDAV_PATHS.calendars, {}, calendarListSchema)
    expect(result).toEqual({
      ok: false,
      status: 502,
      code: null,
      message: `The request failed (502).`,
      offline: false,
    })
  })
})

Deno.test(`forgetting every problem lets the next lost request show the offline notice again`, async () => {
  await withApp(async (server) => {
    server.down = true
    await relay(CALDAV_PATHS.calendars, {}, calendarListSchema)
    resetConnection()
    expect(notice.value).toBeNull()
    await relay(CALDAV_PATHS.calendars, {}, calendarListSchema)
    expect(notice.value).toBe(OFFLINE_NOTICE)
  })
})

Deno.test(`an error code outside the contract is a failure with no code and no server text`, async () => {
  await withApp(async (server) => {
    server.next = error(502, `made_up`, `Basic hunter2 rejected`)
    const result = await relay(CALDAV_PATHS.calendars, {}, calendarListSchema)
    expect(result).toEqual({
      ok: false,
      status: 502,
      code: null,
      message: `The request failed (502).`,
      offline: false,
    })
    expect(serverProblem.value).toBeNull()
  })
})

Deno.test(`a contract error code reaches the caller as a typed code with the server's message`, async () => {
  await withApp(async (server) => {
    server.next = error(409, `uid_conflict`, `Another task has this UID`)
    const result = await relay(CALDAV_PATHS.calendars, {}, calendarListSchema)
    expect(result).toEqual({
      ok: false,
      status: 409,
      code: ApiErrorCode.UidConflict,
      message: `Another task has this UID`,
      offline: false,
    })
  })
})

Deno.test(`a request is sent with the same-origin cookie policy`, async () => {
  await withApp(async (server) => {
    let credentials: RequestCredentials | undefined
    const own = globalThis.fetch
    globalThis.fetch = (input, init) => {
      credentials = init?.credentials
      return own(input, init)
    }
    try {
      server.calendarList = []
      await relay(CALDAV_PATHS.calendars, {}, calendarListSchema)
    } finally {
      globalThis.fetch = own
    }
    expect(credentials).toBe(`same-origin`)
  })
})
