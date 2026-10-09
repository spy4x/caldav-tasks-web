import { type } from "arktype"

/**
 * The CalDAV half of the JSON contract. The server relays CalDAV and never reads a task; a task
 * travels as its raw iCalendar text with the version (etag) it came from. Owned by the CalDAV issue.
 *
 * An href is the path of a calendar or task on the CalDAV server, exactly as the server listed it,
 * such as `/user/tasks/` or `/user/tasks/3f2a.ics`. Send it back unchanged: the server accepts only
 * the hrefs of calendars it listed and of the tasks directly inside them, and answers 400
 * `bad_request` for anything else before it contacts the CalDAV server.
 *
 * How a CalDAV failure reaches the browser (every error body is an `ApiError`):
 *
 * | Status | Code                 | When                                                        |
 * | ------ | -------------------- | ----------------------------------------------------------- |
 * | 400    | `bad_request`        | A malformed request, or an href outside the listed calendars |
 * | 404    | `not_found`          | The calendar or task no longer exists                       |
 * | 409    | `already_exists`     | A new task's address was taken; sending it again may work   |
 * | 409    | `uid_conflict`       | Another task has the same UID, or the edit changes the UID  |
 * | 412    | `conflict`           | The etag is stale: read the task again, re-apply, retry     |
 * | 413    | `too_large`          | The request or the CalDAV server's reply is too large       |
 * | 502    | `caldav_refused`     | The CalDAV server refused the configured account            |
 * | 502    | `caldav_failed`      | The CalDAV server answered with something unusable          |
 * | 503    | `caldav_unreachable` | The CalDAV server cannot be reached                         |
 * | 504    | `caldav_unreachable` | The CalDAV server took too long                             |
 */

/** Where each CalDAV route lives. Every one needs the owner's session. */
export const CALDAV_PATHS = {
  /**
   * `GET`; answers 200 with a {@link CalendarList} of the calendars that can hold tasks.
   *
   * `POST` a {@link CreateCalendarRequest}; creates a task list in the account's calendar home and
   * answers 201 with a {@link CalendarCreated}.
   */
  calendars: "/api/caldav/calendars",
  /**
   * `PATCH` an {@link UpdateCalendarRequest}; renames or recolours a listed calendar, answers 204.
   *
   * `DELETE` with a {@link DeleteCalendarRequest} body; deletes a listed calendar and every task in
   * it, answers 204.
   */
  calendar: "/api/caldav/calendar",
  /**
   * `GET ?calendar=<href>`, optionally `&completed=true`; answers 200 with an {@link ObjectList}
   * of the calendar's open tasks, or of all its tasks with `completed=true`.
   *
   * `POST` a {@link CreateObjectRequest}; answers 201 with a {@link WriteResult}.
   */
  objects: "/api/caldav/objects",
  /**
   * `GET ?href=<href>`; answers 200 with one {@link TaskObject}.
   *
   * `PUT` an {@link UpdateObjectRequest}; answers 200 with a {@link WriteResult}, or 412
   * `conflict` when the etag is stale, leaving the task unchanged.
   *
   * `DELETE` with a {@link DeleteObjectRequest} body; answers 204, or 412 `conflict` when the etag
   * is stale.
   */
  object: "/api/caldav/object",
} as const

/** Largest request body the CalDAV routes accept, in bytes: 1 MiB. */
export const CALDAV_MAX_REQUEST_BYTES = 1024 * 1024

/** A calendar on the CalDAV server that can hold tasks. */
export const calendarSchema = type({
  /** Where the calendar lives on the CalDAV server. */
  href: "string",
  displayName: "string",
  /** A CSS colour, when the server has one. */
  "color?": "string",
  /** The component types it accepts, e.g. `VTODO`. Empty means the server did not say. */
  components: "string[]",
  /** The server's change marker for the calendar: its ctag or sync token. */
  "changeMarker?": "string",
})

/** A calendar on the CalDAV server that can hold tasks. */
export type Calendar = typeof calendarSchema.infer

/** What `GET /api/caldav/calendars` answers. */
export const calendarListSchema = type({ calendars: calendarSchema.array() })

/** What `GET /api/caldav/calendars` answers. */
export type CalendarList = typeof calendarListSchema.infer

/**
 * One task as the server holds it: untouched iCalendar text and the version it has. `etag` is
 * exactly what the CalDAV server sent, quotes included, or `null` when it sent none; a task without
 * one cannot be updated or deleted until it is read again with one.
 */
export const taskObjectSchema = type({
  href: "string",
  etag: "string | null",
  ics: "string",
})

/** One task as the server holds it. */
export type TaskObject = typeof taskObjectSchema.infer

/** What `GET /api/caldav/objects` answers. */
export const objectListSchema = type({ objects: taskObjectSchema.array() })

/** What `GET /api/caldav/objects` answers. */
export type ObjectList = typeof objectListSchema.infer

/** The body of `POST /api/caldav/objects`: a new task for a calendar. */
export const createObjectRequestSchema = type({
  /** The calendar's href. */
  calendar: "string > 0",
  ics: "string > 0",
  /**
   * The object's file name, such as `<uid>.ics`, so a create that is sent twice (an offline queue
   * repeating it after a lost answer) finds its own object instead of making a second. Letters,
   * digits, `.`, `_`, `~` and `-` only. Without it the server picks a random name.
   */
  "name?": "string > 0",
  "+": "reject",
})

/** The body of `POST /api/caldav/objects`. */
export type CreateObjectRequest = typeof createObjectRequestSchema.infer

/** The body of `PUT /api/caldav/object`: the new text and the etag it was edited from. */
export const updateObjectRequestSchema = type({
  href: "string > 0",
  /** The etag exactly as the task was read with it. */
  etag: "string > 0",
  ics: "string > 0",
  "+": "reject",
})

/** The body of `PUT /api/caldav/object`. */
export type UpdateObjectRequest = typeof updateObjectRequestSchema.infer

/** The body of `DELETE /api/caldav/object`. */
export const deleteObjectRequestSchema = type({
  href: "string > 0",
  /** The etag exactly as the task was read with it. */
  etag: "string > 0",
  "+": "reject",
})

/** The body of `DELETE /api/caldav/object`. */
export type DeleteObjectRequest = typeof deleteObjectRequestSchema.infer

/**
 * Where a written task is and its new etag. `etag` is `null` when the CalDAV server did not send
 * one: read the task again before the next write.
 */
export const writeResultSchema = type({
  href: "string",
  etag: "string | null",
})

/** What a create or update answers. */
export type WriteResult = typeof writeResultSchema.infer

/** A list's name: not blank, at most 255 characters. */
const listNameSchema = type("string <= 255").and(/\S/)

/**
 * A list's colour as the browser sends it: `#rrggbb`. The server writes it to the CalDAV server as
 * `#RRGGBBFF`, the form Tasks.org writes and reads.
 */
export const listColorSchema = type(/^#[0-9a-fA-F]{6}$/)

/** The body of `POST /api/caldav/calendars`: a new task list. */
export const createCalendarRequestSchema = type({
  displayName: listNameSchema,
  "color?": listColorSchema,
  "+": "reject",
})

/** The body of `POST /api/caldav/calendars`. */
export type CreateCalendarRequest = typeof createCalendarRequestSchema.infer

/** What `POST /api/caldav/calendars` answers: where the new list lives. */
export const calendarCreatedSchema = type({ href: "string" })

/** What `POST /api/caldav/calendars` answers. */
export type CalendarCreated = typeof calendarCreatedSchema.infer

/** The body of `PATCH /api/caldav/calendar`: a new name, a new colour, or both. */
export const updateCalendarRequestSchema = type({
  /** The calendar's href, as listed. */
  href: "string > 0",
  "displayName?": listNameSchema,
  "color?": listColorSchema,
  "+": "reject",
}).narrow((body, ctx) =>
  body.displayName !== undefined || body.color !== undefined ||
  ctx.mustBe(`a change of name or colour`)
)

/** The body of `PATCH /api/caldav/calendar`. */
export type UpdateCalendarRequest = typeof updateCalendarRequestSchema.infer

/**
 * Whether a calendar holds tasks only. Only such a list may be deleted here: a calendar that also
 * accepts events, or that does not say what it accepts, may hold events this app never shows.
 */
export function isTasksOnly(components: readonly string[]): boolean {
  return components.length > 0 && components.every((component) => component === "VTODO")
}

/** Why `DELETE /api/caldav/calendar` refuses a calendar that is not {@link isTasksOnly}. */
export const LIST_HOLDS_EVENTS =
  "This list also holds calendar events, so delete it from your calendar app."

/** The body of `DELETE /api/caldav/calendar`. */
export const deleteCalendarRequestSchema = type({
  /** The calendar's href, as listed. */
  href: "string > 0",
  "+": "reject",
})

/** The body of `DELETE /api/caldav/calendar`. */
export type DeleteCalendarRequest = typeof deleteCalendarRequestSchema.infer
