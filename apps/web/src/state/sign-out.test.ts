/// <reference lib="deno.ns" />
import "fake-indexeddb/auto"
import { expect } from "@std/expect"
import { AUTH_PATHS } from "@api/auth.ts"
import { CALDAV_PATHS } from "@api/caldav.ts"
import { PUSH_PATHS, pushDeviceId } from "@api/push.ts"
import { LIST_HREF, task as fixture } from "@tasks/fixtures/tasksorg.ts"
import { calendars } from "./calendars.ts"
import { getStorage, type TaskStorage, useStorage } from "./db.ts"
import { createTestOutboxStore, useOutboxStore } from "./outbox.ts"
import { pendingEntries } from "./pending.ts"
import { SessionStatus, sessionStatus, SIGNED_IN_HINT_KEY } from "./session.ts"
import { CLEAR_FAILED, signOutOfDevice, type SignOutWorker, unsentChanges } from "./sign-out.ts"
import { refresh } from "./sync.ts"
import { saveTask, tasks } from "./tasks.ts"
import { error, type FakeServer, setBrowserOnline, withApp } from "./testing.ts"
import { toasts } from "./toasts.ts"

const HREF = `${LIST_HREF}one.ics`
const NOW = new Date(`2026-10-14T10:00:00.000Z`)
const ENDPOINT = `https://push.example.com/send/abc`

/** One request the app sent to a route that is not a task route. */
interface Sent {
  method: string
  path: string
  body: unknown
}

/** A signed-in browser with one cached task, as far as sign-out can tell. */
interface Device {
  server: FakeServer
  /** The sign-out and push requests, in order. */
  sent: Sent[]
  /** What `localStorage` holds. */
  local: Map<string, string>
  /** The queue's store, to read what is really kept. */
  queue: ReturnType<typeof createTestOutboxStore>
  /** Every request throws, as `fetch` does with no network. */
  down: boolean
  /** The status the server answers a sign-out with. */
  signOutStatus: number
  /** The status the server answers a push unsubscribe with. */
  pushDeleteStatus: number
  /** True once the server ended the session: every later request answers 401. */
  ended: boolean
  /** Whether the browser still holds its push subscription. */
  subscribed: boolean
  /** The reminders showing on the device, and whether each was closed. */
  shown: { closed: boolean; close(): void }[]
  /** When set, a request for the tasks of a list waits for it. */
  hold: Promise<void> | undefined
  worker: SignOutWorker
}

const notification = () => ({
  closed: false,
  close() {
    this.closed = true
  },
})

/**
 * Runs `test` on a signed-in device: one list with one task in the cache, a push subscription in
 * the browser, and a server that ends the session on sign-out and answers 401 afterwards.
 */
async function withDevice(test: (device: Device) => Promise<void>): Promise<void> {
  await withApp(async (server) => {
    const queue = createTestOutboxStore()
    useOutboxStore(queue)
    const device: Device = {
      server,
      sent: [],
      local: new Map([[SIGNED_IN_HINT_KEY, `1`]]),
      queue,
      down: false,
      signOutStatus: 204,
      pushDeleteStatus: 204,
      ended: false,
      subscribed: true,
      shown: [],
      hold: undefined,
      worker: {
        getRegistration: () =>
          Promise.resolve({
            pushManager: {
              getSubscription: () =>
                Promise.resolve(
                  device.subscribed
                    ? {
                      endpoint: ENDPOINT,
                      toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: `p`, auth: `a` } }),
                      unsubscribe: () => {
                        device.subscribed = false
                        return Promise.resolve(true)
                      },
                    }
                    : null,
                ),
            },
            getNotifications: () => Promise.resolve(device.shown),
          }),
      },
    }
    const relayFetch = globalThis.fetch
    const ownStorage = Object.getOwnPropertyDescriptor(globalThis, `localStorage`)
    Object.defineProperty(globalThis, `localStorage`, {
      configurable: true,
      value: {
        getItem: (key: string) => device.local.get(key) ?? null,
        setItem: (key: string, value: string) => void device.local.set(key, value),
        removeItem: (key: string) => void device.local.delete(key),
      },
    })
    globalThis.fetch = async (input, init) => {
      const request = new Request(new URL(String(input), `http://app.localhost`), init)
      const path = new URL(request.url).pathname
      const own = path === AUTH_PATHS.signOut || path === PUSH_PATHS.subscription
      if (own) {
        const body = await request.clone().json().catch(() => null)
        device.sent.push({ method: request.method, path, body })
      }
      if (device.down) throw new TypeError(`Failed to fetch`)
      if (device.ended) return error(401, `unauthorized`, `Sign in first`)
      if (path === AUTH_PATHS.signOut) {
        if (device.signOutStatus < 300) device.ended = true
        return new Response(null, { status: device.signOutStatus })
      }
      if (path === PUSH_PATHS.subscription) {
        return new Response(null, {
          status: request.method === `DELETE` ? device.pushDeleteStatus : 204,
        })
      }
      // The server reads the tasks while the session is good; the answer may arrive later.
      const answer = relayFetch(input, init)
      if (path === CALDAV_PATHS.objects && device.hold) await device.hold
      return answer
    }
    sessionStatus.value = SessionStatus.SignedIn
    server.calendarList = [{ href: LIST_HREF, displayName: `Errands`, changeMarker: `c1` }]
    server.seed(HREF, LIST_HREF, fixture(`1`, `Buy milk`))
    await refresh()
    try {
      await test(device)
    } finally {
      globalThis.fetch = relayFetch
      sessionStatus.value = SessionStatus.Unknown
      for (const toast of toasts.list.value) toasts.remove(toast.id)
      if (ownStorage) Object.defineProperty(globalThis, `localStorage`, ownStorage)
      else delete (globalThis as { localStorage?: unknown }).localStorage
    }
  })
}

/** What the cache really holds, read from storage and not from the screens' stores. */
async function cached(): Promise<{ lists: number; tasks: number }> {
  const storage = getStorage()
  return {
    lists: (await storage.listCalendars()).length,
    tasks: (await storage.listTasks()).length,
  }
}

const toastBodies = () => toasts.list.value.map((toast) => toast.body)

Deno.test(`signing out leaves no task and no list in the cache`, async () => {
  await withDevice(async () => {
    expect(await cached()).toEqual({ lists: 1, tasks: 1 })

    expect(await signOutOfDevice()).toBeNull()

    expect(sessionStatus.value).toBe(SessionStatus.SignedOut)
    expect(await cached()).toEqual({ lists: 0, tasks: 0 })
    expect(tasks.value).toEqual([])
    expect(calendars.value).toEqual([])
    expect(toastBodies()).toEqual([])
  })
})

Deno.test(`signing out removes a cached task whose list is not in the cache`, async () => {
  await withDevice(async () => {
    await getStorage().putTask({
      href: `/dav/tasks/gone/two.ics`,
      calendarHref: `/dav/tasks/gone/`,
      etag: `"9"`,
      ics: fixture(`2`, `Call the bank`),
    })

    await signOutOfDevice()

    expect(await cached()).toEqual({ lists: 0, tasks: 0 })
  })
})

Deno.test(`signing out leaves no unsent change in the queue`, async () => {
  await withDevice(async (device) => {
    setBrowserOnline(false)
    await saveTask(tasks.value[0], { title: `Oat milk` }, NOW)
    expect(await device.queue.readOutbox()).toHaveLength(1)
    // Back online, and signed out before the queue was sent.
    setBrowserOnline(true)

    expect(await signOutOfDevice()).toBeNull()

    expect(await device.queue.readOutbox()).toEqual([])
    expect(pendingEntries.value).toEqual([])
    expect(tasks.value).toEqual([])
  })
})

Deno.test(`unsent changes are counted from the queue's store, before the screens have read it`, async () => {
  await withDevice(async (device) => {
    expect(await unsentChanges()).toBe(0)
    setBrowserOnline(false)
    await saveTask(tasks.value[0], { title: `Oat milk` }, NOW)
    // A page load: the queue is in its store and nothing has read it yet.
    useOutboxStore(device.queue)
    expect(pendingEntries.value).toEqual([])

    expect(await unsentChanges()).toBe(1)
  })
})

Deno.test(`signing out deletes this device's push subscription on the server, then in the browser`, async () => {
  await withDevice(async (device) => {
    expect(await signOutOfDevice(device.worker)).toBeNull()

    // The server takes the delete only from a signed-in device, so it goes first.
    expect(device.sent).toEqual([
      {
        method: `DELETE`,
        path: PUSH_PATHS.subscription,
        body: { deviceId: await pushDeviceId(ENDPOINT) },
      },
      { method: `POST`, path: AUTH_PATHS.signOut, body: null },
    ])
    expect(device.subscribed).toBe(false)
  })
})

Deno.test(`signing out drops the browser's push subscription even when the server could not delete it`, async () => {
  await withDevice(async (device) => {
    device.pushDeleteStatus = 500

    expect(await signOutOfDevice(device.worker)).toBeNull()

    expect(device.subscribed).toBe(false)
    expect(sessionStatus.value).toBe(SessionStatus.SignedOut)
  })
})

Deno.test(`signing out closes the reminders already showing on the device`, async () => {
  await withDevice(async (device) => {
    device.shown = [notification(), notification()]

    await signOutOfDevice(device.worker)

    expect(device.shown.map((shown) => shown.closed)).toEqual([true, true])
  })
})

Deno.test(`tasks that a refresh was still fetching when the session ended are not kept`, async () => {
  await withDevice(async (device) => {
    device.server.calendarList[0].changeMarker = `c2`
    device.server.seed(`${LIST_HREF}two.ics`, LIST_HREF, fixture(`2`, `Call the bank`))
    let release = () => {}
    device.hold = new Promise<void>((resolve) => release = resolve)
    const fetching = refresh()
    // The list of lists has answered and the request for the tasks is on its way.
    while (device.server.count(`GET`, CALDAV_PATHS.objects) < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1))
    }

    const signingOut = signOutOfDevice(device.worker)
    while (!device.ended) await new Promise((resolve) => setTimeout(resolve, 1))
    release()
    await Promise.all([signingOut, fetching])

    expect(await cached()).toEqual({ lists: 0, tasks: 0 })
    expect(tasks.value).toEqual([])
  })
})

Deno.test(`with the server out of reach nothing is cleared and the device stays signed in and subscribed`, async () => {
  await withDevice(async (device) => {
    device.down = true

    expect(await signOutOfDevice(device.worker)).toContain(`Cannot reach the server`)

    expect(sessionStatus.value).toBe(SessionStatus.SignedIn)
    expect(device.sent.map((sent) => sent.path)).toEqual([PUSH_PATHS.subscription])
    expect(device.subscribed).toBe(true)
    expect(await cached()).toEqual({ lists: 1, tasks: 1 })
    expect(device.local.get(SIGNED_IN_HINT_KEY)).toBe(`1`)
  })
})

Deno.test(`a sign-out the server refuses keeps the tasks and saves the push subscription again`, async () => {
  await withDevice(async (device) => {
    device.signOutStatus = 500

    expect(await signOutOfDevice(device.worker)).toBe(`Sign-out failed (500).`)

    expect(sessionStatus.value).toBe(SessionStatus.SignedIn)
    expect(await cached()).toEqual({ lists: 1, tasks: 1 })
    expect(device.subscribed).toBe(true)
    expect(device.sent.map((sent) => `${sent.method} ${sent.path}`)).toEqual([
      `DELETE ${PUSH_PATHS.subscription}`,
      `POST ${AUTH_PATHS.signOut}`,
      `PUT ${PUSH_PATHS.subscription}`,
    ])
  })
})

Deno.test(`a cache that cannot be cleared still signs out, shows no task, and says a copy is still on the device`, async () => {
  await withDevice(async () => {
    const working = getStorage()
    const broken: TaskStorage = {
      ...working,
      replaceCalendars: () => Promise.reject(new DOMException(`blocked`, `InvalidStateError`)),
    }
    useStorage(broken)

    expect(await signOutOfDevice()).toBeNull()

    expect(sessionStatus.value).toBe(SessionStatus.SignedOut)
    expect(tasks.value).toEqual([])
    expect(calendars.value).toEqual([])
    expect(toastBodies()).toEqual([CLEAR_FAILED])
  })
})
