import { effect } from "@preact/signals"
import {
  type AskOnce,
  type PersistentStorageManager,
  requestPersistentStorage,
} from "@spy4x/platform/browser/persistent-storage"
import { pendingEntries } from "./pending.ts"
import { serverTasks } from "./task-store.ts"

/** The `localStorage` key of the note that the browser was asked, kept so it is asked once. */
const ASKED_KEY = `caldav-tasks:persistence-asked`

/**
 * Asks the browser to keep this site's data (the cached tasks and the queued writes) when it runs
 * short of space, the first time the app has data to lose: a cached task or a queued write. A
 * queued write that vanished would be lost for good. The browser may refuse, or ask the person
 * (Firefox does), so it is asked once per device, and not at all when it already said yes.
 *
 * `manager` defaults to `navigator.storage` and `asked` to `localStorage`. Returns the function
 * that stops watching.
 */
export function watchPersistence(
  manager?: PersistentStorageManager,
  asked?: AskOnce[`store`],
): () => void {
  let requested = false
  return effect(() => {
    const hasData = serverTasks.value.length > 0 || pendingEntries.value.length > 0
    if (!hasData || requested) return
    requested = true
    void requestPersistentStorage(manager, { key: ASKED_KEY, store: asked })
  })
}
