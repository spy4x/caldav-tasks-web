/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { DEFAULT_MAX_PUSH_SUBSCRIPTIONS_PER_USER } from "@spy4x/integrations/push-file-store"
import { PUSH_MAX_REQUEST_BYTES, PUSH_PATHS, pushDeviceId } from "@api/push.ts"
import { ORIGIN, setup } from "../caldav/fake-caldav.test.ts"
import { OWNER } from "./reminders.ts"
import { TEST_NOTIFICATION } from "./routes.ts"
import { FakeSender, memoryStore, subscribeBody } from "./testing.ts"

const PUBLIC_KEY = "test-public-key"
/** A push endpoint at a public address literal, so no name is looked up. */
const ENDPOINT = "https://8.8.8.8/push/device-1"
/** The names the fake resolver knows; any other name does not resolve. */
const ADDRESSES: Record<string, string[]> = {
  "push.example.com": ["93.184.216.34"],
  "intranet.example.com": ["10.0.0.5"],
}

/** An app with push on: the real file store in memory and a fake sender. */
async function pushSetup() {
  const store = memoryStore()
  const sender = new FakeSender()
  const app = await setup({
    push: { publicKey: PUBLIC_KEY, store, sender },
    pushRoutes: {
      resolver: {
        resolve: (name) =>
          ADDRESSES[name] ? Promise.resolve(ADDRESSES[name]) : Promise.reject(new Error("unknown")),
      },
    },
  })
  const save = async (endpoint: string) =>
    await app.send(PUSH_PATHS.subscription, { method: "PUT", body: await subscribeBody(endpoint) })
  const endpoints = async () => (await store.listByUser(OWNER)).map((entry) => entry.endpoint)
  return { ...app, store, sender, save, endpoints }
}

const WRITES: [string, string][] = [
  ["PUT", PUSH_PATHS.subscription],
  ["DELETE", PUSH_PATHS.subscription],
  ["POST", PUSH_PATHS.test],
]

Deno.test("refuses every push route without a session, and saves and sends nothing", async () => {
  const { app, sender, endpoints } = await pushSetup()
  for (const [method, path] of [["GET", PUSH_PATHS.key], ...WRITES]) {
    const response = await app.request(path, {
      method,
      headers: {
        origin: ORIGIN,
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
      },
      body: method === "PUT" ? JSON.stringify(await subscribeBody(ENDPOINT)) : undefined,
    })
    expect([method, path, response.status]).toEqual([method, path, 401])
    expect((await response.json()).code).toBe("unauthorized")
  }
  expect(await endpoints()).toEqual([])
  expect(sender.sent).toEqual([])
})

Deno.test("refuses a cross-site push write even with a session", async () => {
  const { send, sender, endpoints } = await pushSetup()
  for (const [method, path] of WRITES) {
    const response = await send(path, {
      method,
      body: method === "POST" ? undefined : await subscribeBody(ENDPOINT),
      headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    })
    expect([method, response.status]).toEqual([method, 403])
    await response.body?.cancel()
  }
  expect(await endpoints()).toEqual([])
  expect(sender.sent).toEqual([])
})

Deno.test("answers the public key when push is on", async () => {
  const { send } = await pushSetup()
  const response = await send(PUSH_PATHS.key)
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ publicKey: PUBLIC_KEY })
})

Deno.test("answers a null key and has no other push route on a server with no push keys", async () => {
  const { send } = await setup()
  const key = await send(PUSH_PATHS.key)
  expect(key.status).toBe(200)
  expect(await key.json()).toEqual({ publicKey: null })
  for (const [method, path] of WRITES) {
    const response = await send(path, { method, body: await subscribeBody(ENDPOINT) })
    expect([method, response.status]).toEqual([method, 404])
    expect((await response.json()).code).toBe("not_found")
  }
})

Deno.test("saves a subscription, and saving the same endpoint again keeps one entry", async () => {
  const { save, store, endpoints } = await pushSetup()
  expect((await save(ENDPOINT)).status).toBe(204)
  expect((await save(ENDPOINT)).status).toBe(204)
  expect(await endpoints()).toEqual([ENDPOINT])
  expect((await store.listByUser(OWNER))[0].keys).toEqual({
    auth: "auth-key",
    p256dh: "p256dh-key",
  })
  expect((await save("https://push.example.com/device-2")).status).toBe(204)
  expect(await endpoints()).toEqual([ENDPOINT, "https://push.example.com/device-2"])
})

Deno.test("logs a save the data folder refused as the error's class name, with no path or endpoint", async () => {
  const { save, store } = await pushSetup()
  store.save = () => {
    const error = new Error(`open '/data/push.json' for ${ENDPOINT}`)
    error.name = "PermissionDenied"
    return Promise.reject(error)
  }
  const lines: string[] = []
  const own = console.error
  console.error = (...args: unknown[]) => void lines.push(args.join(" "))
  try {
    expect((await save(ENDPOINT)).status).toBe(500)
  } finally {
    console.error = own
  }
  expect(lines).toEqual(["push: PUT failed: PermissionDenied"])
})

Deno.test("refuses a subscription body that is not the library's subscribe request", async () => {
  const { send, endpoints } = await pushSetup()
  const good = await subscribeBody(ENDPOINT)
  const bodies: unknown[] = [
    {},
    { subscription: good.subscription },
    { ...good, extra: true },
    { ...good, subscription: { endpoint: ENDPOINT } },
    { ...good, subscription: { ...good.subscription, keys: { auth: "a" } } },
    { ...good, deviceId: "x".repeat(257) },
  ]
  for (const body of bodies) {
    const response = await send(PUSH_PATHS.subscription, { method: "PUT", body })
    expect([JSON.stringify(body).slice(0, 60), response.status]).toEqual([
      JSON.stringify(body).slice(0, 60),
      400,
    ])
    expect((await response.json()).code).toBe("bad_request")
  }
  const text = await send(PUSH_PATHS.subscription, {
    method: "PUT",
    raw: JSON.stringify(good),
    contentType: "text/plain",
  })
  expect(text.status).toBe(415)
  await text.body?.cancel()
  expect(await endpoints()).toEqual([])
})

Deno.test("refuses a device name that is not the hash of the endpoint", async () => {
  const { send, endpoints } = await pushSetup()
  const body = { ...await subscribeBody(ENDPOINT), deviceId: await pushDeviceId(`${ENDPOINT}x`) }
  const response = await send(PUSH_PATHS.subscription, { method: "PUT", body })
  expect(response.status).toBe(400)
  await response.body?.cancel()
  expect(await endpoints()).toEqual([])
})

Deno.test("refuses a push request larger than the cap with 413", async () => {
  const { send, endpoints } = await pushSetup()
  const body = await subscribeBody(ENDPOINT)
  const raw = JSON.stringify(body) + " ".repeat(PUSH_MAX_REQUEST_BYTES)
  const response = await send(PUSH_PATHS.subscription, { method: "PUT", raw })
  expect(response.status).toBe(413)
  expect((await response.json()).code).toBe("too_large")
  expect(await endpoints()).toEqual([])
})

Deno.test("refuses an endpoint that is not https", async () => {
  const { save, endpoints } = await pushSetup()
  for (const endpoint of ["http://8.8.8.8/push/1", "ftp://8.8.8.8/push/1", "8.8.8.8/push/1"]) {
    const response = await save(endpoint)
    expect([endpoint, response.status]).toEqual([endpoint, 400])
    await response.body?.cancel()
  }
  expect(await endpoints()).toEqual([])
})

Deno.test("refuses an endpoint on a loopback, private or link-local address, or a name that resolves to one", async () => {
  const { save, endpoints } = await pushSetup()
  const inside = [
    "https://127.0.0.1/push",
    "https://localhost/push",
    "https://[::1]/push",
    "https://10.0.0.5/push",
    "https://172.16.0.9/push",
    "https://192.168.1.10:8443/push",
    "https://169.254.169.254/latest/meta-data",
    "https://[fe80::1]/push",
    "https://[fd00::1]/push",
    "https://intranet.example.com/push",
    "https://does-not-resolve.example.com/push",
    "https://user:secret@8.8.8.8/push",
  ]
  for (const endpoint of inside) {
    const response = await save(endpoint)
    expect([endpoint, response.status]).toEqual([endpoint, 400])
    const body = await response.json()
    expect(body.code).toBe("bad_request")
    expect(JSON.stringify(body)).not.toContain("secret")
  }
  expect(await endpoints()).toEqual([])
})

Deno.test("keeps the library's cap of 20 subscriptions, dropping the oldest", async () => {
  const { save, endpoints } = await pushSetup()
  for (let index = 0; index <= DEFAULT_MAX_PUSH_SUBSCRIPTIONS_PER_USER; index++) {
    expect((await save(`https://8.8.8.8/push/${index}`)).status).toBe(204)
  }
  const kept = await endpoints()
  expect(kept.length).toBe(20)
  expect(kept).not.toContain("https://8.8.8.8/push/0")
  expect(kept).toContain("https://8.8.8.8/push/20")
})

Deno.test("removes the subscription of the named device and leaves the others", async () => {
  const { save, send, endpoints } = await pushSetup()
  await save(ENDPOINT)
  await save("https://8.8.8.8/push/device-2")
  const response = await send(PUSH_PATHS.subscription, {
    method: "DELETE",
    body: { deviceId: await pushDeviceId(ENDPOINT) },
  })
  expect(response.status).toBe(204)
  expect(await endpoints()).toEqual(["https://8.8.8.8/push/device-2"])
})

Deno.test("removing a device that is not subscribed succeeds and removes nothing", async () => {
  const { save, send, endpoints } = await pushSetup()
  await save(ENDPOINT)
  const response = await send(PUSH_PATHS.subscription, {
    method: "DELETE",
    body: { deviceId: await pushDeviceId("https://8.8.8.8/push/unknown") },
  })
  expect(response.status).toBe(204)
  expect(await endpoints()).toEqual([ENDPOINT])
  const bad = await send(PUSH_PATHS.subscription, {
    method: "DELETE",
    body: { endpoint: ENDPOINT },
  })
  expect(bad.status).toBe(400)
  await bad.body?.cancel()
})

Deno.test("sends the test notification to the owner's devices", async () => {
  const { send, sender } = await pushSetup()
  const response = await send(PUSH_PATHS.test, { method: "POST" })
  expect(response.status).toBe(204)
  expect(sender.sent).toEqual([{ userId: OWNER, message: TEST_NOTIFICATION }])
})

Deno.test("says so when no device is subscribed for the test notification", async () => {
  const { send, sender } = await pushSetup()
  sender.result = { success: true, output: "", error: "", deliveries: [] }
  const response = await send(PUSH_PATHS.test, { method: "POST" })
  expect(response.status).toBe(409)
  expect((await response.json()).code).toBe("push_failed")
})

Deno.test("answers 502 without the endpoint when no device got the test notification", async () => {
  const { send, sender } = await pushSetup()
  sender.result = {
    success: false,
    output: "",
    error: "HTTP 403",
    deliveries: [{
      endpoint: ENDPOINT,
      status: "failed",
      httpStatus: 403,
      error: "HTTP 403",
      deleted: false,
    }],
  }
  const response = await send(PUSH_PATHS.test, { method: "POST" })
  expect(response.status).toBe(502)
  const text = await response.text()
  expect(text).toContain("push_failed")
  expect(text).not.toContain("8.8.8.8")
})
