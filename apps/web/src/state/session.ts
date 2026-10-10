import { signal } from "@preact/signals"
import { type } from "arktype"
import { createSignedInHint } from "@spy4x/platform/browser/signed-in-hint"
import { AUTH_PATHS, sessionSchema } from "@api/auth.ts"
import { apiErrorSchema } from "@api/errors.ts"

/** Whether the owner is signed in, as far as the app knows. */
export enum SessionStatus {
  /** Not asked yet: the first answer from the server is pending. */
  Unknown = 1,
  SignedIn = 2,
  SignedOut = 3,
}

/** The session as the app knows it. The cookie itself is HttpOnly and never read here. */
export const sessionStatus = signal(SessionStatus.Unknown)

/**
 * The CalDAV server and account this install uses, as the last session answer reported them, for
 * the Settings screen. `null` before the first answer and on a start without a network. The
 * password is never sent to the browser.
 */
export const caldavAccount = signal<{ url: string; username: string } | null>(null)

const UNREACHABLE = "Cannot reach the server. Check the connection and try again."

/**
 * localStorage key of the "signed in on this device" hint. It lets the installed app open offline
 * to its last view instead of the sign-in screen. It is not a credential and grants nothing: every
 * `/api` request still needs the HttpOnly session cookie, which the server checks.
 */
export const SIGNED_IN_HINT_KEY = "session:signed-in"

/**
 * The hint itself. The stored text stays `1`, as before the library kept it, so a device that is
 * signed in today still opens offline. Blocked storage remembers nothing: an offline start then
 * shows the sign-in screen.
 */
const signedInHint = createSignedInHint<1>(SIGNED_IN_HINT_KEY, {
  validate: (value): value is 1 => value === 1,
})

/**
 * Asks the server whether the session cookie is still good. 200 means signed in and 401 means
 * signed out. With no answer from the server (offline, or an error status from something on the
 * way), the hint decides: the owner who was signed in on this device keeps the app shell, everyone
 * else sees the sign-in screen.
 */
export async function loadSession(): Promise<void> {
  // Stays undefined while the server has not answered either way.
  let signedIn: boolean | undefined
  try {
    const response = await fetch(AUTH_PATHS.session, { credentials: "same-origin" })
    if (response.ok) {
      signedIn = true
      const body = sessionSchema(await response.json().catch(() => null))
      if (!(body instanceof type.errors)) {
        caldavAccount.value = { url: body.caldavUrl, username: body.caldavUsername }
      }
    } else {
      await response.body?.cancel()
      if (response.status === 401) signedIn = false
    }
  } catch {
    // Offline or the server is out of reach.
  }
  if (signedIn === undefined) signedIn = signedInHint.recall() !== null
  else if (signedIn) signedInHint.remember(1)
  else signedInHint.forget()
  sessionStatus.value = signedIn ? SessionStatus.SignedIn : SessionStatus.SignedOut
}

/**
 * Sends the password. Resolves `null` once signed in, or the message to show: a wrong password, a
 * lockout that says when to try again, or a server out of reach.
 */
export async function signIn(password: string): Promise<string | null> {
  let response: Response
  try {
    response = await fetch(AUTH_PATHS.signIn, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    })
  } catch {
    return UNREACHABLE
  }
  if (response.ok) {
    await response.body?.cancel()
    signedInHint.remember(1)
    sessionStatus.value = SessionStatus.SignedIn
    return null
  }
  const body = apiErrorSchema(await response.json().catch(() => null))
  return body instanceof type.errors ? `Sign-in failed (${response.status}).` : body.message
}

/**
 * Ends the session on the server, then shows the sign-in screen. Resolves `null`, or the message to
 * show when the server could not end it; the screen stays signed in then, because the cookie still
 * works.
 */
export async function signOut(): Promise<string | null> {
  try {
    const response = await fetch(AUTH_PATHS.signOut, { method: "POST", credentials: "same-origin" })
    await response.body?.cancel()
    // 401: the session had already ended.
    if (!response.ok && response.status !== 401) return `Sign-out failed (${response.status}).`
  } catch {
    return UNREACHABLE
  }
  signedInHint.forget()
  caldavAccount.value = null
  sessionStatus.value = SessionStatus.SignedOut
  return null
}
