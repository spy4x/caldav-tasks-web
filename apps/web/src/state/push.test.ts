/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { PUSH_PATHS, pushDeviceId } from "@api/push.ts"
import {
  loadPushKey,
  push,
  PUSH_KEY_STORAGE,
  pushKeyUnreachable,
  removePushSubscription,
  savePushSubscription,
  sendTestPush,
  startPush,
} from "./push.ts"

const ENDPOINT = "https://push.example.com/send/abc"
const SUBSCRIPTION = { endpoint: ENDPOINT, keys: { p256dh: "p", auth: "a" } }

/**
 * Answers every `fetch` with `answer` for the test's length and records what was sent.
 * `localStorage` is `storage` meanwhile, or one that throws on every call when it is `null`.
 */
async function withFetch(
  answer: (request: Request) => Response | Promise<Response>,
  test: (sent: Request[]) => Promise<void>,
  storage: Map<string, string> | null = new Map(),
): Promise<void> {
  const own = globalThis.fetch
  const ownStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
  const blocked = () => {
    throw new DOMException("blocked", "SecurityError")
  }
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage
      ? {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => void storage.set(key, value),
        removeItem: (key: string) => void storage.delete(key),
      }
      : { getItem: blocked, setItem: blocked, removeItem: blocked },
  })
  const sent: Request[] = []
  globalThis.fetch = (input, init) => {
    const request = new Request(new URL(String(input), "http://app.localhost"), init)
    sent.push(request)
    return Promise.resolve().then(() => answer(request))
  }
  try {
    await test(sent)
  } finally {
    globalThis.fetch = own
    if (ownStorage) Object.defineProperty(globalThis, "localStorage", ownStorage)
    else delete (globalThis as { localStorage?: unknown }).localStorage
  }
}

const done = () => new Response(null, { status: 204 })
const offline = () => Promise.reject(new TypeError("Failed to fetch"))

Deno.test("the server's push key is loaded and remembered on the device", async () => {
  const storage = new Map<string, string>()
  await withFetch(() => Response.json({ publicKey: "BKey" }), async (sent) => {
    expect(await loadPushKey()).toBe("BKey")
    expect(new URL(sent[0].url).pathname).toBe(PUSH_PATHS.key)
    expect(storage.get(PUSH_KEY_STORAGE)).toBe("BKey")
    expect(pushKeyUnreachable.value).toBe(false)
  }, storage)
})

Deno.test("a server with no push key gives null and forgets a remembered key", async () => {
  const storage = new Map([[PUSH_KEY_STORAGE, "BOld"]])
  await withFetch(() => Response.json({ publicKey: null }), async () => {
    expect(await loadPushKey()).toBeNull()
    expect(storage.has(PUSH_KEY_STORAGE)).toBe(false)
    expect(pushKeyUnreachable.value).toBe(false)
  }, storage)
})

Deno.test("with no answer from the server the remembered push key is used", async () => {
  const answers = [offline, () => new Response("<html>", { status: 502 }), () => Response.json({})]
  for (const answer of answers) {
    await withFetch(answer, async () => {
      expect(await loadPushKey()).toBe("BOld")
      expect(pushKeyUnreachable.value).toBe(false)
    }, new Map([[PUSH_KEY_STORAGE, "BOld"]]))
  }
})

Deno.test("with no answer and nothing remembered the push key is null, marked as not known", async () => {
  for (const storage of [new Map<string, string>(), null]) {
    await withFetch(offline, async () => {
      expect(await loadPushKey()).toBeNull()
      expect(pushKeyUnreachable.value).toBe(true)
    }, storage)
  }
})

Deno.test("saving a subscription PUTs it under the SHA-256 of its endpoint", async () => {
  await withFetch(done, async (sent) => {
    await savePushSubscription(SUBSCRIPTION)
    expect(sent[0].method).toBe("PUT")
    expect(new URL(sent[0].url).pathname).toBe(PUSH_PATHS.subscription)
    expect(sent[0].headers.get("content-type")).toBe("application/json")
    expect(await sent[0].json()).toEqual({
      deviceId: await pushDeviceId(ENDPOINT),
      subscription: SUBSCRIPTION,
    })
  })
})

Deno.test("removing a subscription DELETEs the SHA-256 of its endpoint, never the endpoint", async () => {
  await withFetch(done, async (sent) => {
    await removePushSubscription(ENDPOINT)
    expect(sent[0].method).toBe("DELETE")
    expect(new URL(sent[0].url).pathname).toBe(PUSH_PATHS.subscription)
    expect(await sent[0].json()).toEqual({ deviceId: await pushDeviceId(ENDPOINT) })
  })
})

Deno.test("a test notification is asked for with a POST and no body", async () => {
  await withFetch(done, async (sent) => {
    await sendTestPush()
    expect(sent[0].method).toBe("POST")
    expect(new URL(sent[0].url).pathname).toBe(PUSH_PATHS.test)
    expect(await sent[0].text()).toBe("")
  })
})

Deno.test("every push call rejects when the server refuses or cannot be reached", async () => {
  const calls = [
    () => savePushSubscription(SUBSCRIPTION),
    () => removePushSubscription(ENDPOINT),
    () => sendTestPush(),
  ]
  for (const answer of [() => Response.json({ code: "push_failed" }, { status: 502 }), offline]) {
    await withFetch(answer, async () => {
      for (const call of calls) await expect(call()).rejects.toThrow()
    })
  }
})

Deno.test("a subscription with no endpoint is refused before anything is sent", async () => {
  await withFetch(done, async (sent) => {
    await expect(savePushSubscription({ keys: {} })).rejects.toThrow(TypeError)
    expect(sent).toHaveLength(0)
  })
})

/**
 * Gives the test a browser that can show notifications and holds `subscription`, for its length.
 * Deno has neither `Notification` nor `navigator.serviceWorker`.
 */
async function withBrowser(
  subscription: { endpoint: string; toJSON: () => unknown } | null,
  test: () => Promise<void>,
): Promise<void> {
  const scope = globalThis as { Notification?: unknown }
  scope.Notification = {
    permission: "granted",
    requestPermission: () => Promise.resolve("granted"),
  }
  Object.defineProperty(globalThis.navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration: () =>
        Promise.resolve({ pushManager: { getSubscription: () => Promise.resolve(subscription) } }),
    },
  })
  try {
    await test()
  } finally {
    delete scope.Notification
    delete (globalThis.navigator as { serviceWorker?: unknown }).serviceWorker
  }
}

/** Resolves once the push store reports `status`, or throws after a second. */
async function untilStatus(status: string): Promise<void> {
  for (let tries = 0; tries < 100 && push.status.value !== status; tries++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  expect(push.status.value).toBe(status)
}

Deno.test("when the key request fails at start the block leaves Checking and says the server is out of reach", async () => {
  await withBrowser(null, async () => {
    await withFetch(offline, async () => {
      const stop = startPush()
      await untilStatus("unavailable")
      expect(pushKeyUnreachable.value).toBe(true)
      stop()
    })
  })
})

/** Resolves once a key request made from now on has failed, or throws after a second. */
async function untilAskFailed(): Promise<void> {
  // An earlier test may have left it set.
  pushKeyUnreachable.value = false
  for (let tries = 0; tries < 100 && !pushKeyUnreachable.value; tries++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  expect(pushKeyUnreachable.value).toBe(true)
}

/** Gives the test a page it can hide and show, for its length. Deno has no `document`. */
async function withPage(test: (page: EventTarget & { visibilityState: string }) => Promise<void>) {
  const page = Object.assign(new EventTarget(), { visibilityState: "visible" })
  const scope = globalThis as { document?: unknown }
  scope.document = page
  try {
    await test(page)
  } finally {
    delete scope.document
  }
}

Deno.test("after a failed key request the key is asked for again when the browser goes online, and the block recovers", async () => {
  let reachable = false
  await withBrowser(null, async () => {
    await withFetch(
      () => reachable ? Response.json({ publicKey: "BKey" }) : offline(),
      async (sent) => {
        const stop = startPush()
        await untilAskFailed()
        reachable = true
        globalThis.dispatchEvent(new Event("online"))
        await untilStatus("off")
        expect(pushKeyUnreachable.value).toBe(false)
        expect(sent).toHaveLength(2)
        // With the key known there is nothing left to ask for.
        globalThis.dispatchEvent(new Event("online"))
        await new Promise((resolve) => setTimeout(resolve, 20))
        expect(sent).toHaveLength(2)
        stop()
      },
    )
  })
})

Deno.test("after a failed key request the key is asked for again when the page is shown, not when it is hidden", async () => {
  let reachable = false
  await withPage(async (page) => {
    await withBrowser(null, async () => {
      await withFetch(
        () => reachable ? Response.json({ publicKey: "BKey" }) : offline(),
        async (sent) => {
          const stop = startPush()
          await untilAskFailed()
          reachable = true
          page.visibilityState = "hidden"
          page.dispatchEvent(new Event("visibilitychange"))
          await new Promise((resolve) => setTimeout(resolve, 20))
          expect(sent).toHaveLength(1)
          page.visibilityState = "visible"
          page.dispatchEvent(new Event("visibilitychange"))
          await untilStatus("off")
          expect(sent).toHaveLength(2)
          stop()
          // Stopped: a later failure is not followed by another request.
          pushKeyUnreachable.value = true
          page.dispatchEvent(new Event("visibilitychange"))
          globalThis.dispatchEvent(new Event("online"))
          await new Promise((resolve) => setTimeout(resolve, 20))
          expect(sent).toHaveLength(2)
          pushKeyUnreachable.value = false
        },
      )
    })
  })
})

Deno.test("starting the app on a subscribed device saves its subscription on the server again", async () => {
  const subscription = { endpoint: ENDPOINT, toJSON: () => SUBSCRIPTION }
  await withBrowser(subscription, async () => {
    await withFetch(
      (request) => request.method === "GET" ? Response.json({ publicKey: "BKey" }) : done(),
      async (sent) => {
        const stop = startPush()
        await untilStatus("on")
        stop()
        const saved = sent.find((request) => request.method === "PUT")
        expect(saved && new URL(saved.url).pathname).toBe(PUSH_PATHS.subscription)
        expect(await saved?.json()).toEqual({
          deviceId: await pushDeviceId(ENDPOINT),
          subscription: SUBSCRIPTION,
        })
      },
    )
  })
})
