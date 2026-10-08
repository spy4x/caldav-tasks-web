import { type } from "arktype"
import { ApiErrorCode } from "./errors.ts"

/**
 * The auth half of the JSON contract. The app has one owner and one password, so signing in sends
 * the password alone. The session itself is an HttpOnly cookie the browser never reads; these
 * routes only start it, report it and end it.
 */

/** Where each auth route lives. */
export const AUTH_PATHS = {
  /** `POST` the password; answers 204 and sets the session cookie. */
  signIn: "/api/auth/sign-in",
  /** `POST`; ends the session and clears the cookie. Answers 204. */
  signOut: "/api/auth/sign-out",
  /** `GET`; answers 200 with a {@link Session} while signed in, 401 otherwise. */
  session: "/api/auth/session",
} as const

/** The body of a sign-in request. */
export const signInRequestSchema = type({
  password: "string > 0",
  "+": "reject",
})

/** The body of a sign-in request. */
export type SignInRequest = typeof signInRequestSchema.infer

/** What `GET /api/auth/session` answers while signed in. */
export const sessionSchema = type({
  /** When the session ends, as an ISO 8601 instant. */
  expiresAt: "string",
})

/** What `GET /api/auth/session` answers while signed in. */
export type Session = typeof sessionSchema.infer

/**
 * The 429 a locked-out sign-in gets. `message` already says when to try again; `retryAfterSeconds`
 * is the same wait as a number, and the `Retry-After` header carries it too.
 */
export const tooManyAttemptsSchema = type({
  code: type.unit(ApiErrorCode.TooManyAttempts),
  message: "string",
  retryAfterSeconds: "number.integer > 0",
})

/** The 429 a locked-out sign-in gets. */
export type TooManyAttempts = typeof tooManyAttemptsSchema.infer
