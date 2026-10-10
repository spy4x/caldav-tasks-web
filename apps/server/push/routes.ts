import { Hono } from "hono"
import { PushFileStoreError } from "@spy4x/integrations/push-file-store"
import { type DnsResolver, UrlValidationError, validatePublicUrl } from "@spy4x/net/url-policy"
import {
  type PushSubscribeRequest,
  pushSubscribeRequestSchema,
  type PushUnsubscribeRequest,
  pushUnsubscribeRequestSchema,
} from "@spy4x/platform/model"
import type { Type } from "arktype"
import { ApiErrorCode } from "@api/errors.ts"
import { PUSH_MAX_REQUEST_BYTES, pushDeviceId, type PushKey } from "@api/push.ts"
import { readRequest, refuse } from "../caldav/http.ts"
import { nameOf, OWNER } from "./reminders.ts"
import type { Push } from "./start.ts"

/** What the test notification says. */
export const TEST_NOTIFICATION = {
  title: "Test notification",
  body: "Reminders will show up like this.",
  url: null,
  tag: "test",
}

/** Test seams. */
export interface PushRoutesOptions {
  /** Resolves a push endpoint's host for the public-address check. Defaults to the system's. */
  resolver?: DnsResolver
}

const NOT_A_PUSH_SERVICE = "The subscription does not name a push service"

/**
 * The `/api/push` routes, behind the owner's session and the same-origin check like every other
 * `/api` route. `push` is `null` on a server with no push keys: the key route then answers `null`
 * and the others do not exist.
 *
 * A subscription's endpoint is an address the server will later send to, and a signed-in script
 * chooses it. So it is saved only when it is `https:` and names a public host: loopback, private
 * and link-local addresses, and names that resolve to one, are refused with 400. The sender checks
 * again before each push. A user keeps at most 20 subscriptions; the store drops the oldest.
 *
 * Failures are logged with a code only, never an endpoint or a key.
 */
export function createPushRoutes(push: Push | null, options: PushRoutesOptions = {}): Hono {
  const routes = new Hono()

  routes.get("/key", (c) => c.json({ publicKey: push?.publicKey ?? null } satisfies PushKey))

  if (push === null) return routes
  const { store, sender } = push

  routes.put("/subscription", async (c) => {
    const body = await readRequest(
      c,
      pushSubscribeRequestSchema as unknown as Type<PushSubscribeRequest>,
      PUSH_MAX_REQUEST_BYTES,
    )
    if (body instanceof Response) return body
    const { endpoint } = body.subscription
    if (body.deviceId !== await pushDeviceId(endpoint)) {
      return refuse(c, 400, "The device name does not belong to the subscription")
    }
    // The check has two limits. A host name is resolved here and again when the push is sent, so
    // a name that answers with a public address now and a private one then gets past it; Deno's
    // `--deny-net` cannot close that, because the CalDAV server is usually on a private address.
    // And any port of a public host is accepted, as Web Push allows. Either way a signed-in
    // owner gets one encrypted POST and learns only whether it was taken.
    try {
      await validatePublicUrl(endpoint, { resolver: options.resolver, allowHttp: false })
    } catch (error) {
      if (!(error instanceof UrlValidationError)) throw error
      return refuse(c, 400, NOT_A_PUSH_SERVICE)
    }
    try {
      // An upsert: the same endpoint replaces its entry, so a page load may save it again.
      await store.save(OWNER, body.subscription)
    } catch (error) {
      if (error instanceof PushFileStoreError && error.code === "invalid-subscription") {
        return refuse(c, 400, NOT_A_PUSH_SERVICE)
      }
      throw error
    }
    return c.body(null, 204)
  })

  routes.delete("/subscription", async (c) => {
    const body = await readRequest(
      c,
      pushUnsubscribeRequestSchema as unknown as Type<PushUnsubscribeRequest>,
      PUSH_MAX_REQUEST_BYTES,
    )
    if (body instanceof Response) return body
    for (const { endpoint } of await store.listByUser(OWNER)) {
      if (await pushDeviceId(endpoint) === body.deviceId) {
        await store.deleteByEndpoint(OWNER, endpoint)
      }
    }
    // Also when nothing matched: the device is not subscribed, which is what was asked for.
    return c.body(null, 204)
  })

  routes.post("/test", async (c) => {
    const result = await sender.send(OWNER, TEST_NOTIFICATION)
    const sent = result.deliveries.filter((delivery) => delivery.status === "sent").length
    if (sent > 0) return c.body(null, 204)
    if (result.deliveries.length === 0 && result.success) {
      return c.json(
        { code: ApiErrorCode.PushFailed, message: "No device is subscribed to notifications" },
        409,
      )
    }
    console.warn(`push: the test notification reached 0 of ${result.deliveries.length} devices`)
    return c.json(
      { code: ApiErrorCode.PushFailed, message: "The push service did not take the notification" },
      502,
    )
  })

  routes.onError((error, c) => {
    // The store's code or the error's class, such as `PermissionDenied` for a data folder the
    // process may not write: enough to find the cause, and never a path, an endpoint or a key.
    const detail = error instanceof PushFileStoreError ? error.code : nameOf(error)
    console.error(`push: ${c.req.method} failed: ${detail}`)
    return c.json({ code: ApiErrorCode.PushFailed, message: "Notifications failed" }, 500)
  })

  return routes
}
