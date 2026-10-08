import type { ComponentChildren, JSX } from "preact"
import {
  IconCalendarDays,
  IconEllipsisVertical,
  IconLens,
  IconList,
  IconSun,
} from "@spy4x/preact-icons"
import { RailShell, type RailShellItem } from "@spy4x/preact-system/rail-shell"
import { followLinkClick } from "@spy4x/preact-ui/link"

/** The page each destination opens. Kept here so the router and the navigation cannot drift. */
export const PATHS = {
  today: "/",
  upcoming: "/upcoming",
  lists: "/lists",
  search: "/search",
  more: "/more",
} as const

/** The five destinations, in display order: the rail from `md` up, the tab bar below. */
export const NAV_ITEMS: readonly RailShellItem[] = [
  { key: "today", label: "Today", href: PATHS.today, Icon: IconSun },
  { key: "upcoming", label: "Upcoming", href: PATHS.upcoming, Icon: IconCalendarDays },
  { key: "lists", label: "Lists", href: PATHS.lists, Icon: IconList },
  { key: "search", label: "Search", href: PATHS.search, Icon: IconLens },
  { key: "more", label: "More", href: PATHS.more, Icon: IconEllipsisVertical },
]

/** The navigation entry a path belongs to, or `undefined` for a path no entry owns. */
export function navKey(path: string | undefined): string | undefined {
  if (path === undefined) return undefined
  if (path === PATHS.today) return "today"
  for (const item of NAV_ITEMS) {
    if (
      item.href !== PATHS.today && item.href &&
      (path === item.href || path.startsWith(`${item.href}/`))
    ) {
      return item.key
    }
  }
  return undefined
}

/**
 * The app's frame: the rail from `md` up and the phone tab bar below, around the page. `navigate`
 * takes over clicks on the navigation links, so moving between pages never reloads the app.
 */
export function AppFrame(
  { currentPath, navigate, children }: {
    currentPath?: string
    navigate?: (path: string) => void
    children: ComponentChildren
  },
): JSX.Element {
  return (
    <div
      onClick={(event) => {
        const link = (event.target as Element | null)?.closest?.(
          `a[data-e2e="rail-shell-entry"]`,
        )
        const href = link?.getAttribute("href")
        if (href) followLinkClick(event, { href, navigate })
      }}
    >
      <RailShell items={NAV_ITEMS} currentKey={navKey(currentPath)}>
        {children}
      </RailShell>
    </div>
  )
}

/**
 * An empty page that holds a destination's place until the issue that builds it lands. It has a
 * heading and nothing else.
 */
export function PlaceholderPage({ title }: { title: string }): JSX.Element {
  return (
    <div class="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 class="text-2xl font-semibold" data-e2e="page-title">{title}</h1>
    </div>
  )
}
