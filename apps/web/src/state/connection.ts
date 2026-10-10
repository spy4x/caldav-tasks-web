import { computed, signal } from "@preact/signals"
import type { Type } from "arktype"
import { createOnlineStatus } from "@spy4x/preact-signals/online"
import { createOfflineFetch, INVALID_REPLY_CODE } from "@spy4x/platform/api"
import { ApiErrorCode } from "@api/errors.ts"

/** What went wrong with the CalDAV server behind the relay, when the relay itself answered. */
export enum ServerProblemKind {
  Unreachable = 1,
  /** The server refused the configured credentials. */
  Refused,
  /** The server answered with something the relay cannot use. */
  Failed,
}

/** A CalDAV server problem, with the status the relay answered. Never carries a secret. */
export interface ServerProblem {
  kind: ServerProblemKind
  status: number
}

/** Shown while the browser has no network or the last request never got an answer. */
export const OFFLINE_NOTICE = `Offline: showing your last copy, changes will sync when you are back`

/**
 * Whether the browser says it has a network. `connection.watch()` follows the online and offline
 * events; {@link startSync} calls it.
 */
export const connection = createOnlineStatus()

/** Sends the requests and knows whether the last one got no answer at all. */
const api = createOfflineFetch()

/** Whether the last request to the app server got no answer at all, as a signal. */
const requestFailed = signal(api.requestFailed)
api.subscribe((failed) => requestFailed.value = failed)

/** The CalDAV server's state as the last answer from the relay reported it, or `null` when fine. */
export const serverProblem = signal<ServerProblem | null>(null)

/** True when the app cannot reach its server: writes are paused and the last copy is shown. */
export const offline = computed(() => !connection.online.value || requestFailed.value)

/**
 * The notice to show on every screen, or `null`. Offline wins over a server problem: with no
 * network, the server's last answer is stale.
 */
export const notice = computed<string | null>(() => {
  if (offline.value) return OFFLINE_NOTICE
  const problem = serverProblem.value
  if (!problem) return null
  switch (problem.kind) {
    case ServerProblemKind.Unreachable:
      return `CalDAV server unreachable (${problem.status}): showing your last copy`
    case ServerProblemKind.Refused:
      return `CalDAV server refused the credentials (${problem.status}): check the server settings`
    case ServerProblemKind.Failed:
      return `CalDAV server sent an unusable reply (${problem.status}): showing your last copy`
  }
})

/** Forgets every problem. For a test. */
export function resetConnection(): void {
  // Reads `navigator.onLine` again, which is online where there is none (Deno).
  connection.watch(null)()
  // Through the wrapper, which owns the flag: setting the signal alone would leave it set there.
  api.report(false)
  serverProblem.value = null
}

/** What {@link relay} reports. */
export type RelayResult<T> =
  | { ok: true; status: number; data: T }
  | {
    ok: false
    /** `0` when the request got no answer. */
    status: number
    code: ApiErrorCode | null
    /** Ready to show; the relay never puts a credential in it. */
    message: string
    /** True when the request got no answer: the app is offline for now. */
    offline: boolean
  }

export interface RelayRequest {
  method?: `GET` | `POST` | `PUT` | `PATCH` | `DELETE`
  /** Sent as JSON. */
  body?: unknown
}

const CODE_TO_PROBLEM: Partial<Record<ApiErrorCode, ServerProblemKind>> = {
  [ApiErrorCode.CalDavUnreachable]: ServerProblemKind.Unreachable,
  [ApiErrorCode.CalDavRefused]: ServerProblemKind.Refused,
  [ApiErrorCode.CalDavFailed]: ServerProblemKind.Failed,
}

const ERROR_CODES = new Set<string>(Object.values(ApiErrorCode))

/**
 * Sends one request to the relay and reports the outcome instead of throwing. It also keeps the
 * {@link notice} up to date: an answer clears the offline state, and a CalDAV failure code sets the
 * server problem. `schema` checks a success body; one that does not match is a failure.
 */
export async function relay<T>(
  path: string,
  request: RelayRequest = {},
  schema?: Type<T>,
): Promise<RelayResult<T>> {
  const result = await api.fetch(path, {
    method: request.method ?? `GET`,
    credentials: `same-origin`,
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
  }, schema)
  if (result.ok) {
    serverProblem.value = null
    return { ok: true, status: result.status, data: (schema ? result.data : undefined) as T }
  }
  if (result.offline) {
    return { ok: false, status: 0, code: null, message: OFFLINE_NOTICE, offline: true }
  }
  const { status, error } = result
  // A success body that fails its schema. A server may send this code itself, hence the status.
  if (error.code === INVALID_REPLY_CODE && status < 300) {
    serverProblem.value = null
    return fail(status, ApiErrorCode.CalDavFailed, `The server sent an unusable reply.`)
  }
  // An answer without a code from the contract (a proxy's error page) has no message to trust.
  if (!error.code || !ERROR_CODES.has(error.code)) {
    return fail(status, null, `The request failed (${status}).`)
  }
  const code = error.code as ApiErrorCode
  const kind = CODE_TO_PROBLEM[code]
  serverProblem.value = kind ? { kind, status } : null
  return { ok: false, status, code, message: error.message, offline: false }
}

function fail(status: number, code: ApiErrorCode | null, message: string): RelayResult<never> {
  return { ok: false, status, code, message, offline: false }
}
