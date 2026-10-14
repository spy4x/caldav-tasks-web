import { type CalDavError, CalDavErrorCode } from "@spy4x/caldav"
import { CALDAV_CONDITIONS, OTHER_CONDITION } from "@api/caldav.ts"
import { ApiErrorCode } from "@api/errors.ts"

/** The statuses a CalDAV failure answers with. */
export type CalDavFailureStatus = 400 | 403 | 404 | 409 | 412 | 413 | 502 | 503 | 504

/** How one CalDAV failure reaches the browser. */
export interface CalDavFailure {
  status: CalDavFailureStatus
  code: ApiErrorCode
  /** A fixed message: the CalDAV server's own text never reaches the browser. */
  message: string
  /** The condition the CalDAV server named for a refused write; see {@link writeRefusal}. */
  condition?: string
}

/**
 * Each `CalDavErrorCode` and the one HTTP status and contract code it answers with. The table in
 * `libs/api/caldav.ts` documents the same mapping for the browser.
 *
 * The CalDAV server refusing the account is a 502, not a 401: a 401 from this server means the
 * owner's session ended, and the browser would sign the owner out for a server-side problem. A
 * 403 is a 502 here too; only a write passes it on, through {@link writeRefusal}. A
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

/**
 * How a write the CalDAV server answered with 403 reaches the browser, or `null` for any other
 * failure. The browser's queue must tell this refusal from an outage: a write that is refused for
 * good becomes a choice for the person and the writes behind it go out, while an outage keeps
 * everything queued. So the status and the `DAV:error` condition are passed on, and nothing else of
 * the answer: the condition is a name from {@link CALDAV_CONDITIONS} or {@link OTHER_CONDITION},
 * never the server's own text.
 */
export function writeRefusal(error: CalDavError): CalDavFailure | null {
  const forbidden = error.code === CalDavErrorCode.Forbidden ||
    (error.code === CalDavErrorCode.Server && error.status === 403)
  if (!forbidden) return null
  if (error.condition === undefined) {
    return {
      status: 403,
      code: ApiErrorCode.CalDavForbidden,
      message: "The CalDAV server refused this change",
    }
  }
  return {
    status: 403,
    code: ApiErrorCode.CalDavPrecondition,
    message: "The CalDAV server does not accept this change",
    condition: CALDAV_CONDITIONS.includes(error.condition) ? error.condition : OTHER_CONDITION,
  }
}
