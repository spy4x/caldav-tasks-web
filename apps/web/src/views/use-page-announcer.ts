import { useEffect, useRef } from "preact/hooks"
import { useRouteAnnouncer } from "@spy4x/preact-system/route-announcer"

/**
 * Tells keyboard and screen-reader users that the page changed: the tab title names the new page
 * and focus moves to its main heading, through the library's `useRouteAnnouncer`.
 *
 * One case keeps the focus where it is: a page that puts the focus on one of its own controls as
 * it opens (`/` opens Search with the cursor in the search field, `n` opens Today with it in the
 * quick add). The library's hook has no option for that and would move the focus on to the
 * heading, so the control is remembered before it runs and focused again after.
 *
 * @param path The current route, from the router.
 * @param title The tab title of the page at `path`.
 */
export function usePageAnnouncer({ path, title }: { path: string; title: string }): void {
  const shown = useRef(path)
  // What had the focus when the route changed: the link or key target on the page being left.
  const before = useRef<Element | null>(null)
  const taken = useRef<HTMLElement | null>(null)
  if (shown.current !== path) {
    shown.current = path
    before.current = document.activeElement
  }

  useEffect(() => {
    const active = document.activeElement as HTMLElement | null
    const main = document.querySelector(`main`)
    const byThePage = active !== null && active !== before.current && active !== main &&
      !!main?.contains(active)
    taken.current = byThePage ? active : null
  }, [path])

  useRouteAnnouncer({ path, title })

  useEffect(() => {
    taken.current?.focus()
    taken.current = null
  }, [path])
}
