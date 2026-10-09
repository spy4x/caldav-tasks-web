import { computed, signal } from "@preact/signals"
import type { Type } from "arktype"
import { type } from "arktype"
import { ApiErrorCode, apiErrorSchema } from "@api/errors.ts"

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
export const OFFLINE_NOTICE = `Offline: showing your last copy, changes are paused`

/** Whether the browser says it has a network. */
export const browserOnline = signal(globalThis.navigator?.onLine ?? true)

/** Whether the last request to the app server got no answer at all. */
const requestFailed = signal(false)

/** The CalDAV server's state as the last answer from the relay reported it, or `null` when fine. */
export const serverProblem = signal<ServerProblem | null>(null)

/** True when the app cannot reach its server: writes are paused and the last copy is shown. */
export const offline = computed(() => !browserOnline.value || requestFailed.value)

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

/** The parts of `window` the watcher uses, so a test can supply them. */
export interface ConnectionTarget {
  addEventListener(type: `online` | `offline`, listener: () => void): void
  removeEventListener(type: `online` | `offline`, listener: () => void): void
}

/** Follows the browser's online and offline events. Returns the function that stops it. */
export function watchConnection(target: ConnectionTarget = globalThis.window): () => void {
  const up = () => {
    browserOnline.value = true
  }
  const down = () => {
    browserOnline.value = false
  }
  browserOnline.value = globalThis.navigator?.onLine ?? true
  target.addEventListener(`online`, up)
  target.addEventListener(`offline`, down)
  return () => {
    target.removeEventListener(`online`, up)
    target.removeEventListener(`offline`, down)
  }
}

/** Forgets every problem. For a test. */
export function resetConnection(): void {
  browserOnline.value = true
  requestFailed.value = false
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
  method?: `GET` | `POST` | `PUT` | `DELETE`
  /** Sent as JSON. */
  body?: unknown
}

const CODE_TO_PROBLEM: Partial<Record<ApiErrorCode, ServerProblemKind>> = {
  [ApiErrorCode.CalDavUnreachable]: ServerProblemKind.Unreachable,
  [ApiErrorCode.CalDavRefused]: ServerProblemKind.Refused,
  [ApiErrorCode.CalDavFailed]: ServerProblemKind.Failed,
}

/**
 * Sends one request to the relay and reports the outcome instead of throwing. It also keeps the
 * {@link notice} up to date: an answer clears the offline state, and a CalDAV failure code sets the
 * server problem. `schema` checks a success body; one that does not match is a failure.
 *
 * `apiFetch` from `@spy4x/platform/api` is not used: it reads an error's text from `error`, while
 * this contract sends `{ code, message }`, and the code is what tells a refusal from an outage.
 */
export async function relay<T>(
  path: string,
  request: RelayRequest = {},
  schema?: Type<T>,
): Promise<RelayResult<T>> {
  let response: Response
  try {
    response = await fetch(path, {
      method: request.method ?? `GET`,
      credentials: `same-origin`,
      headers: request.body === undefined ? undefined : { "content-type": `application/json` },
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
    })
  } catch {
    requestFailed.value = true
    return { ok: false, status: 0, code: null, message: OFFLINE_NOTICE, offline: true }
  }
  requestFailed.value = false
  if (response.ok) {
    serverProblem.value = null
    if (!schema) {
      await response.body?.cancel()
      return { ok: true, status: response.status, data: undefined as T }
    }
    const parsed = schema(await response.json().catch(() => null))
    if (parsed instanceof type.errors) {
      return fail(response.status, ApiErrorCode.CalDavFailed, `The server sent an unusable reply.`)
    }
    return { ok: true, status: response.status, data: parsed as T }
  }
  const body = apiErrorSchema(await response.json().catch(() => null))
  if (body instanceof type.errors) {
    return fail(response.status, null, `The request failed (${response.status}).`)
  }
  const kind = CODE_TO_PROBLEM[body.code]
  serverProblem.value = kind ? { kind, status: response.status } : null
  return {
    ok: false,
    status: response.status,
    code: body.code,
    message: body.message,
    offline: false,
  }
}

function fail(status: number, code: ApiErrorCode | null, message: string): RelayResult<never> {
  return { ok: false, status, code, message, offline: false }
}
