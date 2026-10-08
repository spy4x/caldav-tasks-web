/// <reference types="vite/client" />
import { h, render } from "preact"
import { SWUpdater, type SWUpdaterProps } from "@spy4x/preact-system/sw-updater"

/**
 * Registers `/sw.js` and shows the "New version available" bar when a new worker waits. Mounts
 * `SWUpdater` in its own element, so the app's tree does not change. A production build only: the
 * dev server has no worker.
 */
export function startPwa(): void {
  if (!import.meta.env.PROD || !(`serviceWorker` in navigator)) return
  const host = document.createElement(`div`)
  document.body.append(host)
  render(h<SWUpdaterProps>(SWUpdater, {}), host)
}
