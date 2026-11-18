import { signal } from "@preact/signals"
import type { TaskList } from "@spy4x/time/ical-tasks-model"
import { PATHS } from "@ui/frame.tsx"
import { listPath } from "../routes.ts"

/** Where this device keeps the list the app opens on. */
export const HOME_LIST_KEY = `caldav-tasks-home-list`

function stored(): string | null {
  try {
    return globalThis.localStorage?.getItem(HOME_LIST_KEY) ?? null
  } catch {
    return null
  }
}

/** The address of the list the app opens on, on this device; `null` opens on Today. */
export const homeHref = signal<string | null>(stored())

/** Makes `href` the list the app opens on here, or Today with `null`. */
export function setHomeList(href: string | null): void {
  homeHref.value = href
  try {
    if (href === null) globalThis.localStorage?.removeItem(HOME_LIST_KEY)
    else globalThis.localStorage?.setItem(HOME_LIST_KEY, href)
  } catch {
    // Private windows may refuse; the choice then lasts until reload.
  }
}

/** The default list among `lists`, if one is chosen and still exists. */
export function homeList<T extends { href: string }>(lists: readonly T[]): T | undefined {
  const href = homeHref.value
  return href === null ? undefined : lists.find((list) => list.href === href)
}

/** Where Home goes: the default list's page, or Today when none is chosen. */
export function homePath(lists: readonly TaskList[]): string {
  const home = homeList(lists)
  return home ? listPath(home) : PATHS.today
}
