/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { AUTH_PATHS } from "@api/auth.ts"
import {
  caldavAccount,
  loadSession,
  SessionStatus,
  sessionStatus,
  SIGNED_IN_HINT_KEY,
  signIn,
  signOut,
} from "./session.ts"

/**
 * An in-memory `localStorage`: Deno's own one persists on disk between runs. `null` gives storage
 * that throws on every call, as a blocked one does.
 */
function fakeStorage(
  storage: Map<string, string> | null,
): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const blocked = () => {
    throw new DOMException("blocked", "SecurityError")
  }
  if (!storage) return { getItem: blocked, setItem: blocked, removeItem: blocked }
  return {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => void storage.set(key, value),
    removeItem: (key) => void storage.delete(key),
  }
}

const signedInDevice = () => new Map([[SIGNED_IN_HINT_KEY, "1"]])
const offline = () => Promise.reject(new TypeError("Failed to fetch"))

/**
 * Answers every `fetch` with `answer` for the test's length, and records what was sent.
 * `localStorage` is `storage` meanwhile (see {@link fakeStorage}).
 */
async function withFetch(
  answer: (request: Request) => Response | Promise<Response>,
  test: (sent: Request[]) => Promise<void>,
  storage: Map<string, string> | null = new Map(),
): Promise<void> {
  const own = globalThis.fetch
  const ownStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
  Object.defineProperty(globalThis, "localStorage", {
    value: fakeStorage(storage),
    configurable: true,
  })
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
    if (ownStorage) Object.defineProperty(globalThis, "localStorage", ownStorage)
    else delete (globalThis as { localStorage?: unknown }).localStorage
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

Deno.test("loading the session follows the server's answer and records it on the device", async () => {
  const storage = new Map<string, string>()
  const answers = [json(200, { expiresAt: "2026-11-07T12:00:00.000Z" }), json(401, {})]
  await withFetch(() => answers.shift()!, async () => {
    await loadSession()
    expect(sessionStatus.value).toBe(SessionStatus.SignedIn)
    expect(storage.get(SIGNED_IN_HINT_KEY)).toBe("1")
    await loadSession()
    expect(sessionStatus.value).toBe(SessionStatus.SignedOut)
    expect(storage.has(SIGNED_IN_HINT_KEY)).toBe(false)
  }, storage)
})

Deno.test("a 401 signs out a device that was signed in", async () => {
  const storage = signedInDevice()
  await withFetch(() => json(401, {}), async () => {
    await loadSession()
    expect(sessionStatus.value).toBe(SessionStatus.SignedOut)
    expect(storage.has(SIGNED_IN_HINT_KEY)).toBe(false)
  }, storage)
})

Deno.test("offline, a device that was signed in keeps the app open", async () => {
  const storage = signedInDevice()
  await withFetch(offline, async () => {
    await loadSession()
    expect(sessionStatus.value).toBe(SessionStatus.SignedIn)
    expect(storage.get(SIGNED_IN_HINT_KEY)).toBe("1")
  }, storage)
})

Deno.test("an error status other than 401 keeps a signed-in device open", async () => {
  await withFetch(() => new Response("Bad Gateway", { status: 502 }), async () => {
    await loadSession()
    expect(sessionStatus.value).toBe(SessionStatus.SignedIn)
  }, signedInDevice())
})

Deno.test("offline, a device that was never signed in shows the sign-in screen", async () => {
  await withFetch(offline, async () => {
    await loadSession()
    expect(sessionStatus.value).toBe(SessionStatus.SignedOut)
  })
})

Deno.test("with storage blocked, the session still loads and offline means signed out", async () => {
  const answers = [() => Promise.resolve(json(200, {})), offline]
  await withFetch(() => answers.shift()!(), async () => {
    await loadSession()
    expect(sessionStatus.value).toBe(SessionStatus.SignedIn)
    await loadSession()
    expect(sessionStatus.value).toBe(SessionStatus.SignedOut)
  }, null)
})

Deno.test("signing in and out records and clears the device hint", async () => {
  const storage = new Map<string, string>()
  const answers = [new Response(null, { status: 204 }), new Response(null, { status: 204 })]
  await withFetch(() => answers.shift()!, async () => {
    expect(await signIn("secret")).toBeNull()
    expect(storage.get(SIGNED_IN_HINT_KEY)).toBe("1")
    expect(await signOut()).toBeNull()
    expect(storage.has(SIGNED_IN_HINT_KEY)).toBe(false)
  }, storage)
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

Deno.test("loading the session keeps the CalDAV server and account for Settings", async () => {
  const body = {
    expiresAt: "2026-11-07T12:00:00.000Z",
    caldavUrl: "https://dav.example.com/dav/",
    caldavUsername: "owner",
  }
  await withFetch(() => json(200, body), async () => {
    caldavAccount.value = null
    await loadSession()
    expect(caldavAccount.value).toEqual({ url: "https://dav.example.com/dav/", username: "owner" })
  }, new Map())
})

Deno.test("signing out forgets the CalDAV account", async () => {
  await withFetch(() => new Response(null, { status: 204 }), async () => {
    caldavAccount.value = { url: "https://dav.example.com/dav/", username: "owner" }
    await signOut()
    expect(caldavAccount.value).toBeNull()
  }, new Map())
})
