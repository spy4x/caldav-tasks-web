import { signal } from "@preact/signals"

const KEY = `focus-new-task`

/**
 * Whether a page puts the cursor in its New task field as it opens (on a desktop). Off until
 * Settings turns it on: off, the focus goes to the page heading and the single-key shortcuts work.
 * A preference of this device, like the shortcuts switch.
 */
export const focusNewTask = signal(read())

function read(): boolean {
  try {
    return globalThis.localStorage?.getItem(KEY) === `on`
  } catch {
    return false
  }
}

export function setFocusNewTask(on: boolean): void {
  focusNewTask.value = on
  try {
    globalThis.localStorage?.setItem(KEY, on ? `on` : `off`)
  } catch {
    // Storage blocked or full: the choice holds until the page is closed.
  }
}
