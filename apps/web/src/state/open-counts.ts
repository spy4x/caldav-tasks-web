import { signal } from "@preact/signals"

const KEY = `show-open-counts`

/** Whether a list's heading shows "4 open". Off until Settings turns it on; kept on this device. */
export const showOpenCounts = signal(read())

function read(): boolean {
  try {
    return globalThis.localStorage?.getItem(KEY) === `on`
  } catch {
    return false
  }
}

export function setShowOpenCounts(on: boolean): void {
  showOpenCounts.value = on
  try {
    globalThis.localStorage?.setItem(KEY, on ? `on` : `off`)
  } catch {
    // Storage blocked or full: the choice holds until the page is closed.
  }
}
