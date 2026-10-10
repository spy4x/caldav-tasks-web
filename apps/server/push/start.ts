import { createCalDavClient } from "@spy4x/caldav"
import { createWebPushSender, type WebPushSender } from "@spy4x/integrations/push"
import {
  createFilePushSubscriptionStore,
  type FilePushSubscriptionStore,
} from "@spy4x/integrations/push-file-store"
import { denoFileSystem } from "@spy4x/platform/server/deno-fs"
import type { ReminderRunner } from "@spy4x/platform/server/reminder-runner"
import type { Config, PushConfig } from "../config.ts"
import { vapidKeysFromText } from "./keys.ts"
import { createReminders, OWNER } from "./reminders.ts"

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
 * Builds reminder notifications from the configuration: the subscription file in `DATA_DIR`, the
 * Web Push sender and the reminder runner over the same CalDAV account the relay uses.
 *
 * It reads the file once, so a folder the process may not read, or a file that is not this app's,
 * stops the server at start-up and not at the first reminder.
 *
 * @throws {ConfigError} for VAPID keys of the wrong shape or of two different pairs.
 */
export async function createPush(config: Config, pushConfig: PushConfig): Promise<PushRuntime> {
  const vapidKeys = await vapidKeysFromText(
    pushConfig.VAPID_PUBLIC_KEY,
    pushConfig.VAPID_PRIVATE_KEY,
  )
  const store = createFilePushSubscriptionStore({
    fs: denoFileSystem,
    path: `${pushConfig.DATA_DIR.replace(/\/+$/, "")}/${PUSH_FILE}`,
  })
  await store.listByUser(OWNER)
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
