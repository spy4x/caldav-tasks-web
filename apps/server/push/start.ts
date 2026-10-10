import { createCalDavClient } from "@spy4x/caldav"
import { createWebPushSender, type WebPushSender } from "@spy4x/integrations/push"
import {
  createFilePushSubscriptionStore,
  type FilePushSubscriptionStore,
  PushFileStoreError,
} from "@spy4x/integrations/push-file-store"
import { denoFileSystem } from "@spy4x/platform/server/deno-fs"
import type { FileSystemPort } from "@spy4x/platform/server/ports"
import type { ReminderRunner } from "@spy4x/platform/server/reminder-runner"
import type { Config, PushConfig } from "../config.ts"
import { vapidKeysFromText } from "./keys.ts"
import { createReminders, nameOf, OWNER } from "./reminders.ts"

/** The file in `DATA_DIR` that holds the push subscriptions and what the runner already sent. */
export const PUSH_FILE = "push.json"

/** What the push routes work with. */
export interface Push {
  /** The VAPID public key a browser subscribes with, base64url. */
  publicKey: string
  store: Pick<FilePushSubscriptionStore, "save" | "listByUser" | "deleteByEndpoint">
  sender: Pick<WebPushSender, "send">
}

/** Reminder notifications, built and not yet running. */
export interface PushRuntime {
  push: Push
  /** Start it once the server is up; stop it at shutdown. */
  runner: ReminderRunner
}

/**
 * The owner's subscriptions in `push.json` of `dataDir`, with the library's cap on how many
 * devices one person keeps.
 */
export function createPushStore(fs: FileSystemPort, dataDir: string): FilePushSubscriptionStore {
  return createFilePushSubscriptionStore({
    fs,
    path: `${dataDir.replace(/\/+$/, "")}/${PUSH_FILE}`,
  })
}

/**
 * Why notifications stay off although they are configured: the data folder or the subscription
 * file in it cannot be used. The message is safe to log: it holds the store's code or the error's
 * class, never a path or anything from the file.
 */
export class PushStateError extends Error {
  constructor(cause: unknown) {
    super(
      cause instanceof PushFileStoreError
        ? `${PUSH_FILE} cannot be used (${cause.code}); it was left as it is`
        : `DATA_DIR cannot be read and written (${nameOf(cause)})`,
    )
    this.name = "PushStateError"
  }
}

/**
 * Checks at start what a reminder would need later: that the subscription file can be read and is
 * this app's, and that the folder takes a new file. The subscription file itself is never written.
 *
 * @throws {PushStateError} when either fails.
 */
export async function checkPushState(
  fs: FileSystemPort,
  dataDir: string,
  store: Pick<FilePushSubscriptionStore, "listByUser">,
): Promise<void> {
  const probe = `${dataDir.replace(/\/+$/, "")}/.write-check`
  try {
    await store.listByUser(OWNER)
    await fs.mkdirp(dataDir)
    await fs.writeText(probe, "")
    await fs.remove(probe)
  } catch (error) {
    throw new PushStateError(error)
  }
}

/**
 * Builds reminder notifications from the configuration: the subscription file in `DATA_DIR`, the
 * Web Push sender and the reminder runner over the same CalDAV account the relay uses.
 *
 * @throws {ConfigError} for VAPID keys of the wrong shape or of two different pairs.
 * @throws {PushStateError} for a data folder or a subscription file that cannot be used: the
 * entry then starts with notifications off, so the tasks keep working.
 */
export async function createPush(config: Config, pushConfig: PushConfig): Promise<PushRuntime> {
  const vapidKeys = await vapidKeysFromText(
    pushConfig.VAPID_PUBLIC_KEY,
    pushConfig.VAPID_PRIVATE_KEY,
  )
  const store = createPushStore(denoFileSystem, pushConfig.DATA_DIR)
  await checkPushState(denoFileSystem, pushConfig.DATA_DIR, store)
  const sender = await createWebPushSender({
    vapidKeys,
    subject: pushConfig.VAPID_SUBJECT,
    store,
  })
  const client = createCalDavClient({
    serverUrl: config.CALDAV_URL,
    auth: { username: config.CALDAV_USERNAME, password: config.CALDAV_PASSWORD },
  })
  const runner = createReminders({
    client,
    sender,
    state: store.state("reminders"),
    zone: pushConfig.REMINDER_TIME_ZONE,
  })
  return { push: { publicKey: pushConfig.VAPID_PUBLIC_KEY.trim(), store, sender }, runner }
}
