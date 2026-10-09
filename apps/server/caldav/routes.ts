import { type Context, Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { type Type, type } from "arktype"
import {
  type CalDavCalendar,
  type CalDavClient,
  CalDavErrorCode,
  type CalDavResult,
  createCalDavClient,
} from "@spy4x/caldav"
import { readJsonBody } from "@spy4x/server/http/bounded-body"
import { ApiErrorCode } from "@api/errors.ts"
import {
  CALDAV_MAX_REQUEST_BYTES,
  type Calendar,
  type CalendarList,
  createObjectRequestSchema,
  deleteObjectRequestSchema,
  type ObjectList,
  type TaskObject,
  updateObjectRequestSchema,
  type WriteResult,
} from "@api/caldav.ts"
import type { Config } from "../config.ts"
import { CALDAV_FAILURES, type CalDavFailure, UNEXPECTED_FAILURE } from "./errors.ts"
import { canonicalPath, hrefOf, parentCalendar } from "./scope.ts"

/** What the CalDAV routes need from the configuration. */
export type CalDavConfig = Pick<Config, "CALDAV_URL" | "CALDAV_USERNAME" | "CALDAV_PASSWORD">

/** Test seams. */
export interface CalDavRoutesOptions {
  /** The CalDAV client. Defaults to one built from the configuration. */
  client?: CalDavClient
}

/** The outcome of one or more CalDAV calls: the value, or how to answer the browser. */
type Outcome<T> = { ok: true; value: T } | { ok: false; failure: CalDavFailure }

/** The statuses a refusal of the request itself uses. */
type RefusalStatus = 400 | 408 | 413 | 415

/**
 * The `/api/caldav` routes: a relay between the browser and the one CalDAV account in the
 * configuration. It lists the calendars that can hold tasks and passes each task through as raw
 * iCalendar text with its href and etag, without parsing it.
 *
 * Every href the browser sends must be a calendar the relay listed, or a task directly inside one;
 * anything else is refused with 400 before any request leaves the server. A calendar created
 * elsewhere is found by listing the calendars again once. Discovery runs on the first request and
 * is kept once it succeeds, so a CalDAV server that is down at start does not stop the app.
 *
 * Writes pass the browser's etag through exactly; a stale one answers 412 `conflict`. Failures are
 * logged with their code and status only, never a credential, a task's text or an etag.
 */
export function createCaldavRoutes(config: CalDavConfig, options: CalDavRoutesOptions = {}): Hono {
  const client = options.client ?? createCalDavClient({
    serverUrl: config.CALDAV_URL,
    auth: { username: config.CALDAV_USERNAME, password: config.CALDAV_PASSWORD },
  })
  const origin = new URL(config.CALDAV_URL).origin
  /** The calendars that can hold tasks, by href, as last listed. */
  let calendars = new Map<string, CalDavCalendar>()
  let homes: Promise<Outcome<string[]>> | undefined

  /** Runs one client call and turns its result, or anything it throws, into an outcome. */
  async function call<T>(
    operation: string,
    run: () => Promise<CalDavResult<T>>,
  ): Promise<Outcome<T>> {
    try {
      const result = await run()
      if (result.success) return { ok: true, value: result.output }
      const status = result.error.status ? ` (HTTP ${result.error.status})` : ``
      console.warn(`caldav: ${operation} failed: ${CalDavErrorCode[result.error.code]}${status}`)
      return { ok: false, failure: CALDAV_FAILURES[result.error.code] ?? UNEXPECTED_FAILURE }
    } catch (error) {
      // The client returns failures rather than throwing them; the name is enough to find a bug.
      const name = error instanceof Error ? error.name : typeof error
      console.error(`caldav: ${operation} threw ${name}`)
      return { ok: false, failure: UNEXPECTED_FAILURE }
    }
  }

  /** The calendar homes, discovered once and kept; a failed discovery is tried again next time. */
  function discoverHomes(): Promise<Outcome<string[]>> {
    homes ??= call("discover", () => client.discover()).then((outcome) => {
      if (!outcome.ok) {
        homes = undefined
        return outcome
      }
      return { ok: true, value: outcome.value.homeUrls }
    })
    return homes
  }

  /** Lists the calendars that can hold tasks under every home and remembers them. */
  async function loadCalendars(): Promise<Outcome<CalDavCalendar[]>> {
    const found = await discoverHomes()
    if (!found.ok) return found
    const listed: CalDavCalendar[] = []
    for (const home of found.value) {
      const outcome = await call("listCalendars", () => client.listCalendars(home))
      if (!outcome.ok) return outcome
      listed.push(...outcome.value.filter(holdsTasks))
    }
    calendars = new Map(listed.map((calendar) => [hrefOf(calendar.url), calendar]))
    return { ok: true, value: listed }
  }

  /**
   * The listed calendar at `raw`, listing again once when it is not known yet. `null` when `raw` is
   * not a canonical path or names no calendar that can hold tasks.
   */
  async function findCalendar(raw: unknown): Promise<Outcome<CalDavCalendar | null>> {
    const path = canonicalPath(raw)
    if (path === null) return { ok: true, value: null }
    if (!calendars.has(path)) {
      const outcome = await loadCalendars()
      if (!outcome.ok) return outcome
    }
    return { ok: true, value: calendars.get(path) ?? null }
  }

  /** The absolute URL of a task directly inside a listed calendar, or `null` for any other href. */
  async function findObject(raw: unknown): Promise<Outcome<string | null>> {
    const path = canonicalPath(raw)
    const parent = path === null ? null : parentCalendar(path)
    if (path === null || parent === null) return { ok: true, value: null }
    const calendar = await findCalendar(parent)
    if (!calendar.ok) return calendar
    return { ok: true, value: calendar.value ? new URL(path, origin).href : null }
  }

  const routes = new Hono()

  routes.get("/calendars", async (c) => {
    const outcome = await loadCalendars()
    if (!outcome.ok) return failed(c, outcome.failure)
    return c.json({ calendars: outcome.value.map(toCalendar) } satisfies CalendarList)
  })

  routes.get("/objects", async (c) => {
    const completed = c.req.query("completed")
    if (completed !== undefined && completed !== "true" && completed !== "false") {
      return refuse(c, 400, "completed must be true or false")
    }
    const calendar = await findCalendar(c.req.query("calendar"))
    if (!calendar.ok) return failed(c, calendar.failure)
    if (!calendar.value) return outside(c)
    const url = calendar.value.url
    const outcome = await call(
      "listObjects",
      () => client.listObjects(url, { component: "VTODO", includeCompleted: completed === "true" }),
    )
    if (!outcome.ok) return failed(c, outcome.failure)
    return c.json({ objects: outcome.value.map(toTaskObject) } satisfies ObjectList)
  })

  routes.get("/object", async (c) => {
    const url = await findObject(c.req.query("href"))
    if (!url.ok) return failed(c, url.failure)
    if (!url.value) return outside(c)
    const target = url.value
    const outcome = await call("getObject", () => client.getObject(target))
    if (!outcome.ok) return failed(c, outcome.failure)
    return c.json(toTaskObject(outcome.value) satisfies TaskObject)
  })

  routes.post("/objects", async (c) => {
    const body = await readRequest(c, createObjectRequestSchema)
    if (body instanceof Response) return body
    const calendar = await findCalendar(body.calendar)
    if (!calendar.ok) return failed(c, calendar.failure)
    if (!calendar.value) return outside(c)
    const url = calendar.value.url
    const outcome = await call("createObject", () => client.createObject(url, body.ics))
    if (!outcome.ok) return failed(c, outcome.failure)
    return c.json(toWriteResult(outcome.value), 201)
  })

  routes.put("/object", async (c) => {
    const body = await readRequest(c, updateObjectRequestSchema)
    if (body instanceof Response) return body
    const url = await findObject(body.href)
    if (!url.ok) return failed(c, url.failure)
    if (!url.value) return outside(c)
    const target = url.value
    const outcome = await call(
      "updateObject",
      () => client.updateObject(target, body.ics, body.etag),
    )
    if (!outcome.ok) return failed(c, outcome.failure)
    return c.json(toWriteResult(outcome.value))
  })

  routes.delete("/object", async (c) => {
    const body = await readRequest(c, deleteObjectRequestSchema)
    if (body instanceof Response) return body
    const url = await findObject(body.href)
    if (!url.ok) return failed(c, url.failure)
    if (!url.value) return outside(c)
    const target = url.value
    const outcome = await call("deleteObject", () => client.deleteObject(target, body.etag))
    if (!outcome.ok) return failed(c, outcome.failure)
    return c.body(null, 204)
  })

  return routes
}

/** Whether a calendar can hold tasks: it lists VTODO, or does not say, which allows any. */
function holdsTasks(calendar: CalDavCalendar): boolean {
  return calendar.components.length === 0 || calendar.components.includes("VTODO")
}

function toCalendar(calendar: CalDavCalendar): Calendar {
  const changeMarker = calendar.ctag ?? calendar.syncToken
  return {
    href: hrefOf(calendar.url),
    displayName: calendar.displayName,
    ...(calendar.color === undefined ? {} : { color: calendar.color }),
    components: calendar.components,
    ...(changeMarker === undefined ? {} : { changeMarker }),
  }
}

function toTaskObject(object: { url: string; etag: string | null; data: string }): TaskObject {
  return { href: hrefOf(object.url), etag: object.etag, ics: object.data }
}

function toWriteResult(write: { url: string; etag: string | null }): WriteResult {
  return { href: hrefOf(write.url), etag: write.etag }
}

/** Reads and checks a JSON body under {@link CALDAV_MAX_REQUEST_BYTES}, or answers the refusal. */
async function readRequest<T>(c: Context, schema: Type<T>): Promise<T | Response> {
  const contentType = c.req.header("content-type") ?? ""
  if (!/^application\/json\s*(;|$)/i.test(contentType)) {
    return refuse(c, 415, "Send the request as JSON")
  }
  let body: unknown
  try {
    body = await readJsonBody(c, { maxBytes: CALDAV_MAX_REQUEST_BYTES })
  } catch (error) {
    if (!(error instanceof HTTPException)) throw error
    // readJsonBody throws only 400, 408 and 413, each with a message that holds no body.
    if (error.status === 413) return failed(c, CALDAV_FAILURES[CalDavErrorCode.TooLarge])
    return refuse(c, error.status as RefusalStatus, error.message)
  }
  const request = schema(body)
  if (request instanceof type.errors) return refuse(c, 400, "The request is not valid")
  return request as T
}

function refuse(c: Context, status: RefusalStatus, message: string): Response {
  return c.json({ code: ApiErrorCode.BadRequest, message }, status)
}

function outside(c: Context): Response {
  return refuse(c, 400, "Not a task list or task this server lists")
}

function failed(c: Context, failure: CalDavFailure): Response {
  return c.json({ code: failure.code, message: failure.message }, failure.status)
}
