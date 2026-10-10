import type { PushSendResult, WebPushSender } from "@spy4x/integrations/push"
import type { FilePushSubscriptionStore } from "@spy4x/integrations/push-file-store"
import type { PushNotificationMessage, PushSubscriptionJson } from "@spy4x/platform/model"
import type { FileSystemPort } from "@spy4x/platform/server/ports"
import { pushDeviceId } from "@api/push.ts"
import { createPushStore } from "./start.ts"

/** A file system in memory, with the calls the subscription store makes. */
export function memoryFileSystem(): FileSystemPort & { files: Map<string, string> } {
  const files = new Map<string, string>()
  const unused = (): never => {
    throw new Error("not used by the push store")
  }
  return {
    files,
    exists: (path) => Promise.resolve(files.has(path)),
    readText: (path) => Promise.resolve(files.get(path) ?? null),
    writeText: (path, content) => Promise.resolve(void files.set(path, content)),
    rename: (from, to) => {
      const content = files.get(from)
      if (content === undefined) return Promise.reject(new Error("no such file"))
      files.set(to, content)
      files.delete(from)
      return Promise.resolve()
    },
    remove: (path) => Promise.resolve(void files.delete(path)),
    mkdirp: () => Promise.resolve(),
    appendText: unused,
    readDir: unused,
    lock: unused,
  }
}

/** The real subscription store over a file system in memory. */
export function memoryStore(): FilePushSubscriptionStore {
  return createPushStore(memoryFileSystem(), "/data")
}

/** A sender that records what it was asked to push and answers with `result`. */
export class FakeSender implements Pick<WebPushSender, "send"> {
  sent: { userId: string | number; message: PushNotificationMessage }[] = []
  result: PushSendResult = {
    success: true,
    output: "",
    error: "",
    deliveries: [{ endpoint: "", status: "sent", error: "", deleted: false }],
  }
  send(userId: string | number, message: PushNotificationMessage): Promise<PushSendResult> {
    this.sent.push({ userId, message })
    return Promise.resolve(this.result)
  }
}

/** A subscription as a browser sends it. The keys are made up; nothing is ever pushed to it. */
export function subscription(endpoint: string): PushSubscriptionJson {
  return { endpoint, expirationTime: null, keys: { auth: "auth-key", p256dh: "p256dh-key" } }
}

/** The body of a subscribe request for `endpoint`, named the way the browser names it. */
export async function subscribeBody(endpoint: string) {
  return { deviceId: await pushDeviceId(endpoint), subscription: subscription(endpoint) }
}
