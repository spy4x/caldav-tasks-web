import { type } from "arktype"

/**
 * What every route shares: why a request was refused. The auth and CalDAV contracts add their own
 * codes here only through the issue that needs them.
 *
 * The contract uses arktype directly: `@spy4x/validation` exports error and issue types and helpers
 * for reading them, not schema builders, so there is nothing in it to define a schema with.
 */

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
  /** The CalDAV server refused the configured credentials, or forbids the request. */
  CalDavRefused = "caldav_refused",
  /** The CalDAV server answered in a way the relay cannot use: a 5xx, a malformed reply. */
  CalDavFailed = "caldav_failed",
  /** A new task's address is already taken on the CalDAV server. Sending it again may work. */
  AlreadyExists = "already_exists",
  /** Another task in the list has the same UID, or the edit changes the UID. Retrying fails. */
  UidConflict = "uid_conflict",
  /** The request or the CalDAV server's reply is larger than allowed. */
  TooLarge = "too_large",
  /** Too many failed sign-in attempts; try again later. */
  TooManyAttempts = "too_many_attempts",
}

/** The body of every error response. It never carries a credential. */
export const apiErrorSchema = type({
  code: type.enumerated(...Object.values(ApiErrorCode)),
  message: "string",
})

/** The body of every error response. */
export type ApiError = typeof apiErrorSchema.infer
