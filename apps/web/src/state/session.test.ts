/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { AUTH_PATHS } from "@api/auth.ts"
import { loadSession, SessionStatus, sessionStatus, signIn, signOut } from "./session.ts"

/** Answers every `fetch` with `answer` for the test's length, and records what was sent. */
async function withFetch(
  answer: (request: Request) => Response | Promise<Response>,
  test: (sent: Request[]) => Promise<void>,
): Promise<void> {
  const own = globalThis.fetch
  const sent: Request[] = []
  globalThis.fetch = (input, init) => {
    const request = new Request(new URL(String(input), "http://app.localhost"), init)
    sent.push(request)
    return Promise.resolve(answer(request))
  }
  sessionStatus.value = SessionStatus.Unknown
  try {
    await test(sent)
  } finally {
    globalThis.fetch = own
  }
}

const json = (status: number, body: unknown) => Response.json(body, { status })

Deno.test("signing in posts the password as JSON and marks the session signed in", async () => {
  await withFetch(() => new Response(null, { status: 204 }), async (sent) => {
    expect(await signIn("secret")).toBeNull()
    expect(sessionStatus.value).toBe(SessionStatus.SignedIn)
    expect(sent[0].method).toBe("POST")
    expect(new URL(sent[0].url).pathname).toBe(AUTH_PATHS.signIn)
    expect(sent[0].headers.get("content-type")).toBe("application/json")
    expect(await sent[0].json()).toEqual({ password: "secret" })
  })
})

Deno.test("a refused sign-in returns the server's message and stays signed out", async () => {
  const answers = [
    json(401, { code: "unauthorized", message: "Wrong password" }),
    json(429, {
      code: "too_many_attempts",
      message: "Too many wrong passwords. Try again in 15 minutes.",
      retryAfterSeconds: 900,
    }),
    new Response("<html>", { status: 502 }),
  ]
  await withFetch(() => answers.shift()!, async () => {
    expect(await signIn("x")).toBe("Wrong password")
    expect(await signIn("x")).toBe("Too many wrong passwords. Try again in 15 minutes.")
    expect(await signIn("x")).toBe("Sign-in failed (502).")
    expect(sessionStatus.value).toBe(SessionStatus.Unknown)
  })
})

Deno.test("a sign-in that cannot reach the server says so", async () => {
  await withFetch(() => Promise.reject(new TypeError("offline")), async () => {
    expect(await signIn("x")).toBe("Cannot reach the server. Check the connection and try again.")
  })
})

Deno.test("loading the session follows the server's answer", async () => {
  const answers = [json(200, { expiresAt: "2026-11-07T12:00:00.000Z" }), json(401, {})]
  await withFetch(() => answers.shift()!, async () => {
    await loadSession()
    expect(sessionStatus.value).toBe(SessionStatus.SignedIn)
    await loadSession()
    expect(sessionStatus.value).toBe(SessionStatus.SignedOut)
  })
})

Deno.test("signing out marks the session signed out only once the server ended it", async () => {
  const answers = [json(500, {}), new Response(null, { status: 204 })]
  await withFetch(() => answers.shift()!, async (sent) => {
    sessionStatus.value = SessionStatus.SignedIn
    expect(await signOut()).toBe("Sign-out failed (500).")
    expect(sessionStatus.value).toBe(SessionStatus.SignedIn)
    expect(await signOut()).toBeNull()
    expect(sessionStatus.value).toBe(SessionStatus.SignedOut)
    expect(sent.map((request) => new URL(request.url).pathname)).toEqual([
      AUTH_PATHS.signOut,
      AUTH_PATHS.signOut,
    ])
  })
})
