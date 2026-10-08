import { type Context, Hono, type MiddlewareHandler } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import { HTTPException } from "hono/http-exception"
import { type } from "arktype"
import { createSignedPayloadCodec } from "@spy4x/platform/signed-payload"
import { clientIp, clientIpBucket, humanRetry } from "@spy4x/platform/rate-limit/client-ip"
import { createPasswordHasher } from "@spy4x/server/sign-in"
import { createLockout } from "@spy4x/server/lockout"
import { MemoryLockoutStore } from "@spy4x/server/lockout/memory-store"
import { createSameOriginMutationGuard } from "@spy4x/server/http/same-origin"
import { readJsonBody } from "@spy4x/server/http/bounded-body"
import { ApiErrorCode } from "@api/errors.ts"
import { type Session, signInRequestSchema, type TooManyAttempts } from "@api/auth.ts"
import type { Config } from "../config.ts"

/**
 * The session cookie's name without its prefix. It is sent as `__Host-session`: the browser then
 * takes it only with `Secure` and `Path=/` and without `Domain`, so a page on another subdomain
 * cannot plant one (session fixation).
 */
export const SESSION_COOKIE = "session"

/** The cookie's full name, as the browser sends it back. */
export const SESSION_COOKIE_HEADER_NAME = `__Host-${SESSION_COOKIE}`

/** How long a session lasts. It is not extended: the owner signs in again after this. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** Largest sign-in body accepted, in bytes. A password is at most 1024 bytes. */
export const SIGN_IN_MAX_BYTES = 4096

/** Wrong passwords one client address may try before it is locked out: the library default. */
export const PER_ADDRESS_POLICY = {
  freeFailures: 5,
  firstLockMs: 15 * 60_000,
  maxLockMs: 24 * 60 * 60_000,
  quietResetMs: 7 * 24 * 60 * 60_000,
} as const

/**
 * Wrong passwords from every address together before all sign-in stops for a while. It catches
 * guessing spread over many addresses. It is looser than the per-address one, so one guesser hits
 * its own lock first, and its locks are short, because while it runs the owner cannot sign in
 * either. Sessions already open keep working.
 */
export const OVERALL_POLICY = {
  freeFailures: 30,
  firstLockMs: 60_000,
  maxLockMs: 60 * 60_000,
  quietResetMs: 24 * 60 * 60_000,
} as const

/**
 * Proxies whose `X-Real-IP` header is believed: private and loopback networks, where Traefik or
 * another proxy in front of the container connects from. A client that reaches the server straight
 * from the internet is keyed on its own address, whatever header it sends.
 */
export const TRUSTED_PROXY_RANGES: readonly string[] = [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "127.0.0.0/8",
  "::1/128",
  "fc00::/7",
]

const OVERALL_SUBJECT = "all"

const sessionPayload = type({ sid: "string == 36", expiresAt: "number.integer", "+": "reject" })

/** What the auth module needs from the configuration. */
export type AuthConfig = Pick<
  Config,
  "PUBLIC_URL" | "OWNER_PASSWORD_HASH" | "AUTH_PEPPER" | "SESSION_SECRET"
>

/** Test seams. */
export interface AuthOptions {
  /** Clock in Unix milliseconds. Defaults to `Date.now`. */
  now?: () => number
}

/** The pieces `createApp` mounts, in this order. */
export interface Auth {
  /** `POST /sign-in`. Mounted at `/api/auth` before {@link guard}, so it needs no session. */
  signInRoutes: Hono
  /**
   * For every other `/api` request: a valid session first (401 otherwise), then, for anything but
   * GET, HEAD and OPTIONS, the same-origin check (403 otherwise).
   */
  guard: MiddlewareHandler[]
  /** `GET /session` and `POST /sign-out`, mounted at `/api/auth` after {@link guard}. */
  routes: Hono
}

/**
 * Owner sign-in: one password, checked against `OWNER_PASSWORD_HASH`, and a session cookie signed
 * with `SESSION_SECRET` that expires after {@link SESSION_TTL_MS}.
 *
 * There is no session store. Sign-out remembers the signed-out session's id in memory until it
 * would have expired, so the same cookie is refused even if it was copied. A restart forgets that
 * list; rotating `SESSION_SECRET` ends every session for good. The lockout counters live in memory
 * too, so a restart clears them.
 */
export function createAuth(config: AuthConfig, options: AuthOptions = {}): Auth {
  const now = options.now ?? Date.now
  const clock = { now }
  const hasher = createPasswordHasher({ pepper: config.AUTH_PEPPER })
  const sessions = createSignedPayloadCodec({
    secret: config.SESSION_SECRET,
    purpose: "caldav-tasks-web.session",
    version: 1,
    schema: sessionPayload,
    now,
  })
  const perAddress = createLockout({
    store: new MemoryLockoutStore(),
    clock,
    ...PER_ADDRESS_POLICY,
  })
  const overall = createLockout({ store: new MemoryLockoutStore(), clock, ...OVERALL_POLICY })
  const signedOut = new Map<string, number>()
  const expectedOrigin = new URL(config.PUBLIC_URL).origin
  const refuseCrossSite = (c: Context) =>
    fail(c, 403, ApiErrorCode.BadRequest, "Cross-site request refused")

  /** The session the request's cookie carries, or `null` when it has none that is valid. */
  async function readSession(c: Context): Promise<typeof sessionPayload.infer | null> {
    const token = getCookie(c, SESSION_COOKIE, "host")
    if (!token) return null
    const result = await sessions.verify(token)
    if (!result.ok || signedOut.has(result.value.sid)) return null
    return result.value
  }

  /** Remembers a session as ended until it would have expired anyway. */
  function forget(session: typeof sessionPayload.infer): void {
    const at = now()
    for (const [sid, expiresAt] of signedOut) if (expiresAt <= at) signedOut.delete(sid)
    signedOut.set(session.sid, session.expiresAt)
  }

  const signInRoutes = new Hono()
  signInRoutes.post(
    "/sign-in",
    createSameOriginMutationGuard({
      requireSessionCookie: false,
      expectedOrigin,
      onReject: refuseCrossSite,
    }),
    async (c) => {
      const contentType = c.req.header("content-type") ?? ""
      if (!/^application\/json\s*(;|$)/i.test(contentType)) {
        return fail(c, 415, ApiErrorCode.BadRequest, "Send the password as JSON")
      }
      let body: unknown
      try {
        body = await readJsonBody(c, { maxBytes: SIGN_IN_MAX_BYTES })
      } catch (error) {
        if (!(error instanceof HTTPException)) throw error
        // readJsonBody throws only 400, 408 and 413, each with a message that holds no body.
        return fail(c, error.status as RefusalStatus, ApiErrorCode.BadRequest, error.message)
      }
      const request = signInRequestSchema(body)
      if (request instanceof type.errors) {
        return fail(c, 400, ApiErrorCode.BadRequest, "Send a password")
      }

      const address = clientIpBucket(
        clientIp(c.req.raw, peerAddress(c), "x-real-ip", { trustedProxies: TRUSTED_PROXY_RANGES }),
      )
      const addressWait = await perAddress.begin(address)
      if (addressWait > 0) return tooManyAttempts(c, addressWait)
      const overallWait = await overall.begin(OVERALL_SUBJECT)
      if (overallWait > 0) {
        // This attempt never reached the password, so it does not count against the address.
        await perAddress.refund(address)
        return tooManyAttempts(c, overallWait)
      }

      const { valid } = await hasher.verify(request.password, config.OWNER_PASSWORD_HASH)
      if (!valid) {
        await Promise.all([perAddress.fail(address), overall.fail(OVERALL_SUBJECT)])
        return fail(c, 401, ApiErrorCode.Unauthorized, "Wrong password")
      }
      await Promise.all([perAddress.refund(address), overall.refund(OVERALL_SUBJECT)])

      // A session the browser already had is ended, and a new one always starts: a cookie set
      // before sign-in is never promoted to a signed-in one.
      const previous = await readSession(c)
      if (previous) forget(previous)
      const expiresAt = now() + SESSION_TTL_MS
      const token = await sessions.sign(
        { sid: crypto.randomUUID(), expiresAt },
        { ttlMs: SESSION_TTL_MS },
      )
      setCookie(c, SESSION_COOKIE, token, {
        prefix: "host",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Strict",
        maxAge: Math.floor(SESSION_TTL_MS / 1000),
      })
      return c.body(null, 204)
    },
  )

  const requireSession: MiddlewareHandler = async (c, next) => {
    if (!(await readSession(c))) return fail(c, 401, ApiErrorCode.Unauthorized, "Sign in first")
    await next()
  }
  const sameOrigin = createSameOriginMutationGuard({
    cookieName: SESSION_COOKIE_HEADER_NAME,
    expectedOrigin,
    onReject: refuseCrossSite,
  })

  const routes = new Hono()
  routes.get("/session", async (c) => {
    // The guard has already checked it; read again for the expiry.
    const session = (await readSession(c))!
    return c.json({ expiresAt: new Date(session.expiresAt).toISOString() } satisfies Session)
  })
  routes.post("/sign-out", async (c) => {
    const session = await readSession(c)
    if (session) forget(session)
    deleteCookie(c, SESSION_COOKIE, {
      prefix: "host",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
    })
    return c.body(null, 204)
  })

  return { signInRoutes, guard: [requireSession, sameOrigin], routes }
}

/** The connection's peer address, which `deno serve` hands Hono as `c.env`. */
function peerAddress(c: Context): string | undefined {
  const info = c.env as { remoteAddr?: { hostname?: unknown } } | undefined
  const hostname = info?.remoteAddr?.hostname
  return typeof hostname === "string" ? hostname : undefined
}

/** The statuses an auth refusal uses. */
type RefusalStatus = 400 | 401 | 403 | 408 | 413 | 415

function fail(c: Context, status: RefusalStatus, code: ApiErrorCode, message: string): Response {
  return c.json({ code, message }, status)
}

function tooManyAttempts(c: Context, waitMs: number): Response {
  const retryAfterSeconds = Math.max(1, Math.ceil(waitMs / 1000))
  const body: TooManyAttempts = {
    code: ApiErrorCode.TooManyAttempts,
    message: `Too many wrong passwords. Try again in ${humanRetry(waitMs)}.`,
    retryAfterSeconds,
  }
  c.header("Retry-After", String(retryAfterSeconds))
  return c.json(body, 429)
}
