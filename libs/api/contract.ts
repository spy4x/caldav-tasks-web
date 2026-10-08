import { type } from "arktype"

/**
 * The JSON the server and the SPA exchange. The server relays CalDAV and never reads a task; a
 * task travels as its raw iCalendar text with the version it came from.
 */

/** A calendar on the CalDAV server that can hold tasks. */
export const calendarSchema = type({
  /** Where the calendar lives on the CalDAV server. */
  href: "string",
  displayName: "string",
  /** A CSS colour, when the server has one. */
  "color?": "string",
  /** The component types it accepts, e.g. `VTODO`. */
  components: "string[]",
  /** The server's change marker for the calendar: its ctag or sync token. */
  "changeMarker?": "string",
})

/** A calendar on the CalDAV server that can hold tasks. */
export type Calendar = typeof calendarSchema.infer

/** One task as the server holds it: untouched iCalendar text and the version it has. */
export const taskObjectSchema = type({
  href: "string",
  etag: "string",
  ics: "string",
})

/** One task as the server holds it. */
export type TaskObject = typeof taskObjectSchema.infer

/** Why the server refused a request. */
export enum ApiErrorCode {
  /** No valid session. */
  Unauthorized = "unauthorized",
  /** The request is malformed or names something the server does not accept. */
  BadRequest = "bad_request",
  NotFound = "not_found",
  /** The task changed on the server since the browser read it (a stale `If-Match`). */
  Conflict = "conflict",
  /** The CalDAV server cannot be reached. */
  CalDavUnreachable = "caldav_unreachable",
  /** The CalDAV server refused the configured credentials. */
  CalDavRefused = "caldav_refused",
}

/** The body of every error response. It never carries a credential. */
export const apiErrorSchema = type({
  code: type.enumerated(...Object.values(ApiErrorCode)),
  message: "string",
})

/** The body of every error response. */
export type ApiError = typeof apiErrorSchema.infer
