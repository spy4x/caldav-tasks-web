import { Hono } from "hono"
import type { CalDavCalendar, CalDavClient, CalDavResult } from "@spy4x/caldav"
import {
  type CalendarCreated,
  createCalendarRequestSchema,
  deleteCalendarRequestSchema,
  updateCalendarRequestSchema,
} from "@api/caldav.ts"
import { failed, outside, readRequest } from "./http.ts"
import type { Outcome } from "./routes.ts"
import { hrefOf } from "./scope.ts"

/** What the list routes need from the relay in `routes.ts`, so both share one view of the lists. */
export interface CalendarRelay {
  client: CalDavClient
  /** Runs one client call and turns its result, or anything it throws, into an outcome. */
  call<T>(operation: string, run: () => Promise<CalDavResult<T>>): Promise<Outcome<T>>
  /** The account's calendar homes, as discovered. */
  homes(): Promise<Outcome<string[]>>
  /** The listed task calendar at a raw href, or `null` for any other href. */
  findCalendar(raw: unknown): Promise<Outcome<CalDavCalendar | null>>
  /** Forgets a calendar that was deleted, so its href and its tasks' hrefs are refused. */
  forget(href: string): void
}

/**
 * The colour as the CalDAV server keeps it: Apple's `calendar-color` in the `#RRGGBBAA` form
 * Tasks.org writes, fully opaque. Tasks.org reads `#RRGGBB` too, but writes this one.
 */
export function toCalendarColor(color: string): string {
  return `${color.toUpperCase()}FF`
}

/**
 * Task-list administration: create a list in the account's first calendar home, and rename,
 * recolour or delete a list the relay listed. A new list accepts VTODO only, as Tasks.org creates
 * one. Any href that is not a listed task list (another user's calendar, an event calendar, a
 * task) is refused with 400 before a request leaves the server. Mounted under `/api/caldav`, behind
 * the session guard.
 */
export function createCalendarAdminRoutes(relay: CalendarRelay): Hono {
  const { client, call } = relay
  const routes = new Hono()

  routes.post("/calendars", async (c) => {
    const body = await readRequest(c, createCalendarRequestSchema)
    if (body instanceof Response) return body
    const homes = await relay.homes()
    if (!homes.ok) return failed(c, homes.failure)
    const home = homes.value[0]
    // Discovery found no home: there is nowhere this account may create a list.
    if (home === undefined) return outside(c)
    const outcome = await call("makeCalendar", () =>
      client.makeCalendar(home, {
        displayName: body.displayName.trim(),
        components: ["VTODO"],
        ...(body.color === undefined ? {} : { color: toCalendarColor(body.color) }),
      }))
    if (!outcome.ok) return failed(c, outcome.failure)
    return c.json({ href: hrefOf(outcome.value.url) } satisfies CalendarCreated, 201)
  })

  routes.patch("/calendar", async (c) => {
    const body = await readRequest(c, updateCalendarRequestSchema)
    if (body instanceof Response) return body
    const calendar = await relay.findCalendar(body.href)
    if (!calendar.ok) return failed(c, calendar.failure)
    if (!calendar.value) return outside(c)
    const url = calendar.value.url
    const changes = {
      ...(body.displayName === undefined ? {} : { displayName: body.displayName.trim() }),
      ...(body.color === undefined ? {} : { color: toCalendarColor(body.color) }),
    }
    const outcome = await call("updateCalendar", () => client.updateCalendar(url, changes))
    if (!outcome.ok) return failed(c, outcome.failure)
    return c.body(null, 204)
  })

  routes.delete("/calendar", async (c) => {
    const body = await readRequest(c, deleteCalendarRequestSchema)
    if (body instanceof Response) return body
    const calendar = await relay.findCalendar(body.href)
    if (!calendar.ok) return failed(c, calendar.failure)
    if (!calendar.value) return outside(c)
    const url = calendar.value.url
    const outcome = await call("deleteCalendar", () => client.deleteCalendar(url))
    if (!outcome.ok) return failed(c, outcome.failure)
    relay.forget(hrefOf(url))
    return c.body(null, 204)
  })

  return routes
}
