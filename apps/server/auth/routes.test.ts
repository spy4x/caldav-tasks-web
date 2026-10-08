/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { fromFileUrl } from "@std/path"
import type { Hono } from "hono"
import { createApp } from "../app.ts"
import { TEST_CONFIG, TEST_OWNER_PASSWORD } from "../test-config.ts"
import { AUTH_PATHS } from "@api/auth.ts"
import { SESSION_COOKIE_HEADER_NAME, SESSION_TTL_MS } from "./routes.ts"

const STATIC_ROOT = fromFileUrl(new URL("../testdata", import.meta.url))
const ORIGIN = new URL(TEST_CONFIG.PUBLIC_URL).origin
const START = Date.UTC(2026, 9, 8, 12)

/** A fresh app with its own lockout counters and a clock the test moves. */
async function setup(): Promise<{ app: Hono; advance: (ms: number) => void }> {
  let time = START
  const app = await createApp(TEST_CONFIG, {
    staticRoot: STATIC_ROOT,
    auth: { now: () => time },
  })
  return { app, advance: (ms) => time += ms }
}

interface SendOptions {
  method?: string
  cookie?: string
  body?: string
  contentType?: string
  /** The connection's peer address. */
  peer?: string
  headers?: Record<string, string>
}

/** A request the app's own page would send, unless the options say otherwise. */
function send(app: Hono, path: string, options: SendOptions = {}): Promise<Response> {
  const headers = new Headers({
    origin: ORIGIN,
    "sec-fetch-site": "same-origin",
    ...options.headers,
  })
  if (options.body !== undefined) {
    headers.set("content-type", options.contentType ?? "application/json")
  }
  if (options.cookie) headers.set("cookie", `${SESSION_COOKIE_HEADER_NAME}=${options.cookie}`)
  return Promise.resolve(
    app.request(
      path,
      { method: options.method ?? "GET", headers, body: options.body },
      { remoteAddr: { hostname: options.peer ?? "198.51.100.1" } },
    ),
  )
}

function signIn(
  app: Hono,
  password: string,
  options: SendOptions = {},
): Promise<Response> {
  return send(app, AUTH_PATHS.signIn, {
    method: "POST",
    body: JSON.stringify({ password }),
    ...options,
  })
}

/** The session cookie's value from a response's `Set-Cookie`. */
function sessionCookie(response: Response): string {
  const header = response.headers.get("set-cookie") ?? ""
  const match = new RegExp(`${SESSION_COOKIE_HEADER_NAME}=([^;]*)`).exec(header)
  if (!match) throw new Error(`no session cookie in: ${header}`)
  return match[1]
}

async function signedIn(app: Hono, options: SendOptions = {}): Promise<string> {
  const response = await signIn(app, TEST_OWNER_PASSWORD, options)
  expect(response.status).toBe(204)
  return sessionCookie(response)
}

Deno.test("the owner password starts a session in a Secure, HttpOnly, SameSite=Strict __Host- cookie", async () => {
  const { app } = await setup()
  const response = await signIn(app, TEST_OWNER_PASSWORD)
  expect(response.status).toBe(204)
  const header = response.headers.get("set-cookie") ?? ""
  expect(header).toMatch(/^__Host-session=[^;]+;/)
  expect(header).toContain("; HttpOnly")
  expect(header).toContain("; Secure")
  expect(header).toContain("; SameSite=Strict")
  expect(header).toContain("; Path=/")
  expect(header).toContain(`; Max-Age=${SESSION_TTL_MS / 1000}`)
  expect(header).not.toContain("Domain=")

  const session = await send(app, AUTH_PATHS.session, { cookie: sessionCookie(response) })
  expect(session.status).toBe(200)
  expect(await session.json()).toEqual({
    expiresAt: new Date(START + SESSION_TTL_MS).toISOString(),
  })
})

Deno.test("a wrong password answers 401 and sets no cookie", async () => {
  const { app } = await setup()
  const response = await signIn(app, "not-the-password")
  expect(response.status).toBe(401)
  expect(response.headers.get("set-cookie")).toBeNull()
  expect(await response.json()).toEqual({ code: "unauthorized", message: "Wrong password" })
})

Deno.test("a tampered session cookie is refused", async () => {
  const { app } = await setup()
  const cookie = await signedIn(app)
  const [payload, signature] = cookie.split(".")
  const flipped = payload.slice(0, -1) + (payload.endsWith("A") ? "B" : "A")
  for (const forged of [`${flipped}.${signature}`, `${payload}.${signature.slice(1)}x`, "junk"]) {
    const response = await send(app, AUTH_PATHS.session, { cookie: forged })
    expect(response.status).toBe(401)
    await response.body?.cancel()
  }
})

Deno.test("a session cookie signed with another secret is refused", async () => {
  const { app } = await setup()
  const other = await createApp(
    { ...TEST_CONFIG, SESSION_SECRET: "another-secret-another-secret-another" },
    { staticRoot: STATIC_ROOT, auth: { now: () => START } },
  )
  const cookie = await signedIn(other)
  const response = await send(app, AUTH_PATHS.session, { cookie })
  expect(response.status).toBe(401)
  await response.body?.cancel()
})

Deno.test("a session cookie is refused once it expires", async () => {
  const { app, advance } = await setup()
  const cookie = await signedIn(app)
  advance(SESSION_TTL_MS - 1)
  const before = await send(app, AUTH_PATHS.session, { cookie })
  expect(before.status).toBe(200)
  await before.body?.cancel()
  advance(1)
  const after = await send(app, AUTH_PATHS.session, { cookie })
  expect(after.status).toBe(401)
  await after.body?.cancel()
})

Deno.test("sign-out clears the cookie and the same cookie is refused afterwards", async () => {
  const { app } = await setup()
  const cookie = await signedIn(app)
  const response = await send(app, AUTH_PATHS.signOut, { method: "POST", cookie })
  expect(response.status).toBe(204)
  expect(response.headers.get("set-cookie")).toMatch(/^__Host-session=;.*Max-Age=0/)
  const replay = await send(app, AUTH_PATHS.session, { cookie })
  expect(replay.status).toBe(401)
  await replay.body?.cancel()
})

Deno.test("signing in again ends the session the browser already had", async () => {
  const { app } = await setup()
  const first = await signedIn(app)
  const second = await signedIn(app, { cookie: first })
  expect(second).not.toBe(first)
  const old = await send(app, AUTH_PATHS.session, { cookie: first })
  expect(old.status).toBe(401)
  await old.body?.cancel()
  const current = await send(app, AUTH_PATHS.session, { cookie: second })
  expect(current.status).toBe(200)
  await current.body?.cancel()
})

Deno.test("after six wrong passwords an address is locked out, the right one included, and told when to retry", async () => {
  const { app, advance } = await setup()
  const peer = "198.51.100.7"
  // Five free failures, then the sixth wrong one is still checked and starts a 15-minute lock.
  for (let attempt = 1; attempt <= 6; attempt++) {
    const response = await signIn(app, "wrong", { peer })
    expect(response.status).toBe(401)
    await response.body?.cancel()
  }
  const locked = await signIn(app, TEST_OWNER_PASSWORD, { peer })
  expect(locked.status).toBe(429)
  expect(locked.headers.get("retry-after")).toBe("900")
  expect(locked.headers.get("set-cookie")).toBeNull()
  expect(await locked.json()).toEqual({
    code: "too_many_attempts",
    message: "Too many wrong passwords. Try again in 15 minutes.",
    retryAfterSeconds: 900,
  })

  // Another address is not affected.
  await signedIn(app, { peer: "198.51.100.8" })

  // Once the lock runs out, the right password works again.
  advance(15 * 60_000)
  await signedIn(app, { peer })
})

Deno.test("sign-in stops for every address after thirty wrong passwords overall", async () => {
  const { app } = await setup()
  // One wrong guess each from 31 addresses: no address reaches its own limit.
  for (let n = 1; n <= 31; n++) {
    const response = await signIn(app, "wrong", { peer: `203.0.113.${n}` })
    expect(response.status).toBe(401)
    await response.body?.cancel()
  }
  const locked = await signIn(app, TEST_OWNER_PASSWORD, { peer: "203.0.113.200" })
  expect(locked.status).toBe(429)
  expect(locked.headers.get("retry-after")).toBe("60")
  await locked.body?.cancel()
})

Deno.test("X-Real-IP names the client only when a private-network proxy sends it", async () => {
  const { app } = await setup()
  // Straight from the internet, a changing header does not escape the address's own lock.
  for (let n = 1; n <= 6; n++) {
    const response = await signIn(app, "wrong", {
      peer: "198.51.100.9",
      headers: { "x-real-ip": `192.0.2.${n}` },
    })
    await response.body?.cancel()
  }
  const direct = await signIn(app, "wrong", {
    peer: "198.51.100.9",
    headers: { "x-real-ip": "192.0.2.99" },
  })
  expect(direct.status).toBe(429)
  await direct.body?.cancel()

  // Through the proxy, each client has its own count, and one locked client does not lock the
  // proxy's other clients.
  for (let n = 1; n <= 7; n++) {
    const response = await signIn(app, "wrong", {
      peer: "172.18.0.2",
      headers: { "x-real-ip": "192.0.2.50" },
    })
    await response.body?.cancel()
  }
  const lockedClient = await signIn(app, "wrong", {
    peer: "172.18.0.2",
    headers: { "x-real-ip": "192.0.2.50" },
  })
  expect(lockedClient.status).toBe(429)
  await lockedClient.body?.cancel()
  await signedIn(app, { peer: "172.18.0.2", headers: { "x-real-ip": "192.0.2.51" } })
})

Deno.test("a cross-site sign-in is refused with 403 and starts no session", async () => {
  const { app } = await setup()
  const cases: Record<string, string>[] = [
    { origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
    { origin: "https://attacker.example", "sec-fetch-site": "same-origin" },
    { origin: ORIGIN, "sec-fetch-site": "same-site" },
  ]
  for (const headers of cases) {
    const response = await signIn(app, TEST_OWNER_PASSWORD, { headers })
    expect(response.status).toBe(403)
    expect(response.headers.get("set-cookie")).toBeNull()
    expect(await response.json()).toEqual({
      code: "bad_request",
      message: "Cross-site request refused",
    })
  }
})

Deno.test("a cross-site sign-out is refused and the session stays valid", async () => {
  const { app } = await setup()
  const cookie = await signedIn(app)
  const response = await send(app, AUTH_PATHS.signOut, {
    method: "POST",
    cookie,
    headers: { origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
  })
  expect(response.status).toBe(403)
  await response.body?.cancel()
  const session = await send(app, AUTH_PATHS.session, { cookie })
  expect(session.status).toBe(200)
  await session.body?.cancel()
})

Deno.test("sign-in takes JSON only, with a password, under 4 KiB", async () => {
  const { app } = await setup()
  const form = await signIn(app, "", {
    body: `password=${TEST_OWNER_PASSWORD}`,
    contentType: "application/x-www-form-urlencoded",
  })
  expect(form.status).toBe(415)
  await form.body?.cancel()
  const broken = await signIn(app, "", { body: "{" })
  expect(broken.status).toBe(400)
  await broken.body?.cancel()
  for (const body of [`{}`, `{"password":""}`, `{"password":1}`, `{"password":"x","extra":1}`]) {
    const response = await signIn(app, "", { body })
    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe("bad_request")
  }
  const huge = await signIn(app, "x".repeat(5000))
  expect(huge.status).toBe(413)
  await huge.body?.cancel()
})

Deno.test("every /api route except sign-in answers 401 without a session", async () => {
  const { app } = await setup()
  const apiRoutes = app.routes.filter((route) => route.path.startsWith("/api"))
  // The walk must see the auth routes, or an empty router would pass.
  expect(apiRoutes.map((route) => route.path)).toEqual(
    expect.arrayContaining([AUTH_PATHS.signIn, AUTH_PATHS.signOut, AUTH_PATHS.session, "/api/*"]),
  )
  for (const route of apiRoutes) {
    const path = route.path.replaceAll(/:[^/]+/g, "x").replaceAll("*", "x")
    const methods = route.method === "ALL" ? ["GET", "POST", "PUT", "DELETE"] : [route.method]
    for (const method of methods) {
      if (method === "POST" && path === AUTH_PATHS.signIn) continue
      const response = await send(app, path, { method })
      expect({ method, path, status: response.status }).toEqual({ method, path, status: 401 })
      await response.body?.cancel()
    }
  }
})

Deno.test("sign-in writes nothing to the console, so no password reaches a log", async () => {
  const { app } = await setup()
  const written: unknown[][] = []
  const names = ["log", "info", "warn", "error", "debug"] as const
  const originals = names.map((name) => console[name])
  for (const name of names) console[name] = (...args: unknown[]) => written.push(args)
  try {
    for (const password of ["wrong-guess", TEST_OWNER_PASSWORD]) {
      const response = await signIn(app, password)
      await response.body?.cancel()
    }
    const broken = await signIn(app, "", { body: `{"password":"half` })
    await broken.body?.cancel()
  } finally {
    names.forEach((name, index) => console[name] = originals[index])
  }
  expect(written).toEqual([])
})
