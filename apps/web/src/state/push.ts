import { signal } from "@preact/signals"
import { type } from "arktype"
import {
  createPushSubscription,
  type PushSubscriptionData,
} from "@spy4x/preact-signals/push-subscription"
import { PUSH_PATHS, pushDeviceId, pushKeySchema } from "@api/push.ts"

/**
 * localStorage key of the server's push public key as last answered. It lets an offline start
 * still say whether this device has notifications on. The key is public: it is what the browser
 * hands to its push service.
 */
export const PUSH_KEY_STORAGE = "push:public-key"

/** Shown instead of "not set up on this server" when the server could not be asked. */
export const PUSH_UNREACHABLE =
  "Cannot reach the server to check notifications. They show here once it answers."

/**
 * The server's push public key: `undefined` until {@link startPush} has an answer, `null` when the
 * server has none or could not be asked and no earlier answer is remembered.
 */
const publicKey = signal<string | null | undefined>(undefined)

/**
 * `true` when the server could not be asked for its key and none is remembered, so "no key" means
 * "not known", not "this server sends no notifications".
 */
export const pushKeyUnreachable = signal(false)

function remembered(): string | null {
  try {
    return localStorage.getItem(PUSH_KEY_STORAGE)
  } catch {
    return null
  }
}

function remember(key: string | null): void {
  try {
    if (key === null) localStorage.removeItem(PUSH_KEY_STORAGE)
    else localStorage.setItem(PUSH_KEY_STORAGE, key)
  } catch {
    // Blocked storage remembers nothing: an offline start then cannot tell.
  }
}

/**
 * Asks the server for its push public key. `null` means it answered that it has none. With no
 * usable answer, the key it gave last time on this device, or `null`.
 */
export async function loadPushKey(): Promise<string | null> {
  try {
    const response = await fetch(PUSH_PATHS.key, { credentials: "same-origin" })
    if (response.ok) {
      const body = pushKeySchema(await response.json().catch(() => null))
      if (!(body instanceof type.errors)) {
        const key = body.publicKey || null
        remember(key)
        pushKeyUnreachable.value = false
        return key
      }
    } else {
      await response.body?.cancel()
    }
  } catch {
    // Offline or the server is out of reach.
  }
  const key = remembered()
  pushKeyUnreachable.value = key === null
  return key
}

/** Sends one push request and rejects unless the server answered 2xx. */
async function send(path: string, method: string, body?: unknown): Promise<void> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  })
  await response.body?.cancel()
  if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}`)
}

/**
 * Saves this device's subscription on the server, which replaces the one with the same endpoint.
 * The server names a device by the SHA-256 of its endpoint, so that name is worked out here.
 */
export async function savePushSubscription(subscription: PushSubscriptionData): Promise<void> {
  if (!subscription.endpoint) throw new TypeError("The push subscription has no endpoint")
  await send(PUSH_PATHS.subscription, "PUT", {
    deviceId: await pushDeviceId(subscription.endpoint),
    subscription,
  })
}

/** Forgets the subscription with this endpoint on the server. One already gone is a success. */
export async function removePushSubscription(endpoint: string): Promise<void> {
  await send(PUSH_PATHS.subscription, "DELETE", { deviceId: await pushDeviceId(endpoint) })
}

/** Asks the server to push a test notification to every device of the owner. */
export function sendTestPush(): Promise<void> {
  return send(PUSH_PATHS.test, "POST")
}

/**
 * The push state of this device. One store for the whole app: {@link startPush} runs it from the
 * signed-in shell and Settings draws it.
 */
export const push = createPushSubscription(() => ({
  publicKey: publicKey.value,
  save: savePushSubscription,
  remove: removePushSubscription,
  sendTest: sendTestPush,
}))

/**
 * Loads the server's key, then reads this device and keeps reading it whenever the page comes
 * back. A device that is subscribed is saved on the server again on every start, which repairs a
 * subscription the server lost.
 *
 * While the server could not be asked for its key, it is asked again each time the page comes
 * back or the browser goes online, so the block in Settings recovers without a reload.
 *
 * @returns The function that stops it.
 */
export function startPush(): () => void {
  let stopStore: (() => void) | undefined
  let stopped = false
  let asking = false
  async function ask(): Promise<void> {
    if (asking) return
    asking = true
    const key = await loadPushKey()
    asking = false
    if (stopped) return
    publicKey.value = key
    if (stopStore) void push.refresh()
    else stopStore = push.start()
  }
  const page = (globalThis as { document?: Document }).document
  const askAgain = (): void => {
    if (pushKeyUnreachable.value && page?.visibilityState !== "hidden") void ask()
  }
  void ask()
  page?.addEventListener("visibilitychange", askAgain)
  globalThis.addEventListener("online", askAgain)
  return () => {
    stopped = true
    page?.removeEventListener("visibilitychange", askAgain)
    globalThis.removeEventListener("online", askAgain)
    stopStore?.()
  }
}
