import { CalDavErrorCode } from "@spy4x/caldav"
import { ApiErrorCode } from "@api/errors.ts"

/** The statuses a CalDAV failure answers with. */
export type CalDavFailureStatus = 400 | 404 | 409 | 412 | 413 | 502 | 503 | 504

/** How one CalDAV failure reaches the browser. */
export interface CalDavFailure {
  status: CalDavFailureStatus
  code: ApiErrorCode
  /** A fixed message: the CalDAV server's own text never reaches the browser. */
  message: string
}

/**
 * Each `CalDavErrorCode` and the one HTTP status and contract code it answers with. The table in
 * `libs/api/caldav.ts` documents the same mapping for the browser.
 *
 * The CalDAV server refusing the account is a 502, not a 401: a 401 from this server means the
 * owner's session ended, and the browser would sign the owner out for a server-side problem. A
 * stale etag is the only failure that answers `conflict`, so the browser can rebase and retry.
 */
export const CALDAV_FAILURES: Readonly<Record<CalDavErrorCode, CalDavFailure>> = {
  [CalDavErrorCode.Conflict]: {
    status: 412,
    code: ApiErrorCode.Conflict,
    message: "The task changed on the server since it was read",
  },
  [CalDavErrorCode.NotFound]: {
    status: 404,
    code: ApiErrorCode.NotFound,
    message: "Not found on the CalDAV server",
  },
  [CalDavErrorCode.Unauthorized]: {
    status: 502,
    code: ApiErrorCode.CalDavRefused,
    message: "The CalDAV server refused the configured account",
  },
  [CalDavErrorCode.Forbidden]: {
    status: 502,
    code: ApiErrorCode.CalDavRefused,
    message: "The CalDAV server forbids this for the configured account",
  },
  [CalDavErrorCode.CrossOriginRedirect]: {
    status: 502,
    code: ApiErrorCode.CalDavFailed,
    message: "The CalDAV server redirected to another address",
  },
  [CalDavErrorCode.OutsideServer]: {
    status: 502,
    code: ApiErrorCode.CalDavFailed,
    message: "The CalDAV server named an address outside itself",
  },
  [CalDavErrorCode.AlreadyExists]: {
    status: 409,
    code: ApiErrorCode.AlreadyExists,
    message: "A task already exists at that address",
  },
  [CalDavErrorCode.UidConflict]: {
    status: 409,
    code: ApiErrorCode.UidConflict,
    message: "Another task in the list has the same UID",
  },
  [CalDavErrorCode.InvalidArgument]: {
    status: 400,
    code: ApiErrorCode.BadRequest,
    message: "The request cannot be sent to the CalDAV server",
  },
  [CalDavErrorCode.TooLarge]: {
    status: 413,
    code: ApiErrorCode.TooLarge,
    message: "Too large for the CalDAV server",
  },
  [CalDavErrorCode.Malformed]: {
    status: 502,
    code: ApiErrorCode.CalDavFailed,
    message: "The CalDAV server's answer cannot be read",
  },
  [CalDavErrorCode.Network]: {
    status: 503,
    code: ApiErrorCode.CalDavUnreachable,
    message: "The CalDAV server cannot be reached",
  },
  [CalDavErrorCode.Timeout]: {
    status: 504,
    code: ApiErrorCode.CalDavUnreachable,
    message: "The CalDAV server took too long to answer",
  },
  [CalDavErrorCode.TooManyRedirects]: {
    status: 502,
    code: ApiErrorCode.CalDavFailed,
    message: "The CalDAV server redirected too many times",
  },
  [CalDavErrorCode.Server]: {
    status: 502,
    code: ApiErrorCode.CalDavFailed,
    message: "The CalDAV server failed",
  },
}

/** What a call that threw, instead of returning a failure, answers with. */
export const UNEXPECTED_FAILURE: CalDavFailure = {
  status: 502,
  code: ApiErrorCode.CalDavFailed,
  message: "The CalDAV server failed",
}
