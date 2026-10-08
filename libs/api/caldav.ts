import { type } from "arktype"

/**
 * The CalDAV half of the JSON contract. The server relays CalDAV and never reads a task; a task
 * travels as its raw iCalendar text with the version it came from. Owned by the CalDAV issue.
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
