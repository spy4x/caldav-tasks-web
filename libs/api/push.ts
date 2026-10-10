import { type } from "arktype"

/**
 * The reminder-notification half of the JSON contract. A device is a browser's push subscription;
 * the server keeps the subscriptions and pushes a reminder to each when it comes due.
 *
 * The bodies of the two subscription requests are `pushSubscribeRequestSchema` and
 * `pushUnsubscribeRequestSchema` from `@spy4x/platform/model`. Their `deviceId` names a device as
 * the SHA-256 of its subscription's endpoint, in hex ({@link pushDeviceId}): the endpoint is what
 * the server stores a subscription under, and it can be longer than a `deviceId` may be.
 */

/** Where each push route lives. All need the owner's session. */
export const PUSH_PATHS = {
  /** `GET`; answers a {@link PushKey}. Also works on a server with no push keys. */
  key: "/api/push/key",
  /**
   * `PUT` a subscribe request to save this device's subscription, replacing the one with the same
   * endpoint; `DELETE` an unsubscribe request to forget it, which also succeeds when it is already
   * gone. Both answer 204.
   */
  subscription: "/api/push/subscription",
  /** `POST`, no body; pushes a test notification to every device of the owner. Answers 204. */
  test: "/api/push/test",
} as const

/** Largest request body the push routes accept, in bytes. A subscription is under 1 KiB. */
export const PUSH_MAX_REQUEST_BYTES = 8 * 1024

/** What `GET /api/push/key` answers. */
export const pushKeySchema = type({
  /**
   * The server's VAPID public key, base64url, as `pushManager.subscribe` takes it. `null` when the
   * server has no push keys: notifications are off for the whole install.
   */
  publicKey: "string | null",
})
/** What `GET /api/push/key` answers. */
export type PushKey = typeof pushKeySchema.infer

/** The name of the device behind a push endpoint: the SHA-256 of the endpoint, in hex. */
export async function pushDeviceId(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/** The address of a task's editor in the web app, which a reminder's notification opens. */
export function taskPath(uid: string): string {
  return `/tasks/${encodeURIComponent(uid)}`
}
