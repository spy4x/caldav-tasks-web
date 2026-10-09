import { effect } from "@preact/signals"
import { pendingEntries } from "./pending.ts"
import { serverTasks } from "./task-store.ts"

/** The part of `navigator.storage` this uses. */
export interface StorageManagerLike {
  persisted(): Promise<boolean>
  persist(): Promise<boolean>
}

/** The part of `localStorage` this uses. */
export interface AskedStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const ASKED_KEY = `caldav-tasks:persistence-asked`

/**
 * Asks the browser to keep this site's data (the cached tasks and the queued writes) when it runs
 * short of space, instead of clearing it as it may by default. A queued write that vanished would
 * be lost for good, so it is asked as soon as there is data. The browser may refuse, or ask the
 * person (Firefox does); it is asked once per device, and not at all when it already said yes.
 *
 * Resolves whether the data is persistent now. Never throws: a browser without the API, or a
 * blocked `localStorage`, simply gets no request.
 */
export async function requestPersistence(
  manager: StorageManagerLike | undefined = globalThis.navigator?.storage,
  asked: AskedStore | undefined = safeLocalStorage(),
): Promise<boolean> {
  if (!manager) return false
  try {
    if (await manager.persisted()) return true
    if (asked?.getItem(ASKED_KEY)) return false
    asked?.setItem(ASKED_KEY, `1`)
    return await manager.persist()
  } catch {
    return false
  }
}

function safeLocalStorage(): AskedStore | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

/**
 * Requests persistence the first time the app has data to lose: a cached task or a queued write.
 * Returns the function that stops watching.
 */
export function watchPersistence(
  manager?: StorageManagerLike,
  asked?: AskedStore,
): () => void {
  let requested = false
  return effect(() => {
    const hasData = serverTasks.value.length > 0 || pendingEntries.value.length > 0
    if (!hasData || requested) return
    requested = true
    void requestPersistence(manager, asked)
  })
}
