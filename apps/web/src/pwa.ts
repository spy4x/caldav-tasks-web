/// <reference types="vite/client" />
import { h, render } from "preact"
import { SWUpdater, type SWUpdaterProps } from "@spy4x/preact-system/sw-updater"

/**
 * The bar as a card in the app's own look, as the library's orange bar is not: the surface with a
 * border and shadow, Reload as the one blue button and Dismiss as plain text. The library takes
 * classes for the bar only, so its buttons (Reload, then Dismiss) are styled from it.
 */
export const UPDATE_BAR_CLASS = [
  `bg-surface! text-foreground! border border-subtle sm:rounded-xl! shadow-md! py-2! ps-4! pe-2!`,
  `[&>button]:rounded-lg! [&>button]:h-8 [&>button]:px-3! [&>button]:py-0! [&>button]:text-sm!`,
  `[&>button]:font-medium! [&>button]:ring-(--color-ring)!`,
  `[&>button:first-of-type]:bg-accent! [&>button:first-of-type]:text-accent-foreground!`,
  `[&>button:first-of-type]:hover:opacity-90`,
  `[&>button:last-of-type]:bg-transparent! [&>button:last-of-type]:text-muted!`,
  `[&>button:last-of-type]:hover:bg-hover! [&>button:last-of-type]:hover:text-foreground!`,
].join(` `)

/**
 * Registers `/sw.js` and shows the "New version available" bar when a new worker waits. Mounts
 * `SWUpdater` in its own element, so the app's tree does not change. A production build only: the
 * dev server has no worker.
 */
export function startPwa(): void {
  if (!import.meta.env.PROD || !(`serviceWorker` in navigator)) return
  const host = document.createElement(`div`)
  document.body.append(host)
  render(h<SWUpdaterProps>(SWUpdater, { class: UPDATE_BAR_CLASS }), host)
}
