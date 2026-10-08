import { signal } from "@preact/signals"
import { type } from "arktype"
import { AUTH_PATHS } from "@api/auth.ts"
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

const UNREACHABLE = "Cannot reach the server. Check the connection and try again."

/** Asks the server whether the session cookie is still good. */
export async function loadSession(): Promise<void> {
  try {
    const response = await fetch(AUTH_PATHS.session, { credentials: "same-origin" })
    await response.body?.cancel()
    sessionStatus.value = response.ok ? SessionStatus.SignedIn : SessionStatus.SignedOut
  } catch {
    sessionStatus.value = SessionStatus.SignedOut
  }
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
  sessionStatus.value = SessionStatus.SignedOut
  return null
}
