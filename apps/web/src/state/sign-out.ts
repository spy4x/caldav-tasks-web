import type {
  PushSubscriptionData,
  PushSubscriptionLike,
} from "@spy4x/preact-signals/push-subscription"
import { calendars, calendarsLoaded } from "./calendars.ts"
import { getStorage } from "./db.ts"
import { clearOutbox, getOutbox, loadOutbox } from "./outbox.ts"
import { pendingEntries } from "./pending.ts"
import { push, removePushSubscription, savePushSubscription } from "./push.ts"
import { signOut, UNREACHABLE } from "./session.ts"
import { lastSyncedAt, refresh } from "./sync.ts"
import { serverTasks } from "./task-store.ts"
import { toasts } from "./toasts.ts"

/** Shown when the session ended but the copy of the tasks on this device could not be deleted. */
export const CLEAR_FAILED =
  `You are signed out, but the tasks kept on this device could not be deleted. Clear this site's data in the browser's settings.`

/** The slice of the page's service worker registration that sign-out uses. */
interface SignOutRegistration {
  /** An old browser has none. */
  readonly pushManager?: { getSubscription(): Promise<PushSubscriptionLike | null> }
  /** The notifications this app is showing now. */
  getNotifications?(): Promise<{ close(): void }[]>
}

/** Service-worker port of {@link signOutOfDevice}. `navigator.serviceWorker` satisfies it. */
export interface SignOutWorker {
  getRegistration(): Promise<SignOutRegistration | undefined>
}

/**
 * How many changes made on this device have not reached the server, read from the queue's store
 * and not from what the screens last saw: right after a page load the two differ. Signing out
 * deletes them, so the caller asks first when there are any.
 */
export async function unsentChanges(): Promise<number> {
  await loadOutbox()
  return pendingEntries.value.length
}

/**
 * Deletes what this device keeps of the owner's tasks: the cached lists and tasks, and every queued
 * write, sent or not. The screens' stores are emptied too. Resolves `false` when the cache or the
 * queue could not be emptied, so the caller can say that a copy is still there.
 */
export async function clearDevice(): Promise<boolean> {
  const [cache, queue] = await Promise.allSettled([clearCache(), clearOutbox()])
  calendars.value = []
  calendarsLoaded.value = false
  serverTasks.value = []
  lastSyncedAt.value = null
  return cache.status === `fulfilled` && queue.status === `fulfilled`
}

async function clearCache(): Promise<void> {
  const storage = getStorage()
  // Dropping a list drops its tasks.
  await storage.replaceCalendars([])
  // A task whose list was never stored is not reached that way.
  for (const task of await storage.listTasks()) await storage.deleteTask(task.href)
}

/**
 * Signs out and leaves nothing of the owner's on this device:
 *
 * 1. deletes this device's push subscription on the server, while the session can still ask for it;
 * 2. ends the session on the server;
 * 3. drops the subscription in the browser, closes the reminders it is showing, and deletes the
 *    cached tasks and the queued writes ({@link clearDevice}).
 *
 * Resolves `null`, or the message to show when the server could not be reached or refused to end
 * the session. Nothing on the device is touched then, and the subscription is saved again, because
 * the device is still signed in. Unsent writes are deleted without a question: the caller asks
 * first (Settings does).
 *
 * `worker` defaults to `navigator.serviceWorker`; `null` or a browser without one has no
 * subscription and shows no reminders.
 */
export async function signOutOfDevice(
  worker: SignOutWorker | null | undefined =
    (globalThis.navigator as { serviceWorker?: SignOutWorker } | undefined)?.serviceWorker,
): Promise<string | null> {
  const registration = await worker?.getRegistration().catch(() => undefined)
  const subscription = await registration?.pushManager?.getSubscription().catch(() => null)
  if (subscription) {
    try {
      await removePushSubscription(subscription.endpoint)
    } catch (error) {
      // `fetch` rejects with a TypeError when there is no answer: signing out would fail the same way.
      if (error instanceof TypeError) return UNREACHABLE
      // The server answered and kept it. Dropping it in the browser below makes it a dead address,
      // which the server forgets on its next push.
    }
  }
  const message = await signOut()
  if (message !== null) {
    if (subscription) {
      await savePushSubscription(subscription.toJSON() as PushSubscriptionData).catch(() => {})
    }
    return message
  }
  await subscription?.unsubscribe().catch(() => false)
  for (const shown of await registration?.getNotifications?.().catch(() => []) ?? []) shown.close()
  let cleared = await clearDevice()
  // A refresh or a send that started while the session was good may still be writing what it
  // fetched. Both calls wait for the one in progress, and a new one gets 401 and writes nothing.
  await Promise.allSettled([getOutbox().flush(), refresh()])
  cleared = await clearDevice() && cleared
  if (!cleared) toasts.error({ title: ``, body: CLEAR_FAILED })
  // Settings reads the store: after the next sign-in it shows notifications as off.
  void push.refresh()
  return null
}
