import type { ComponentChildren, JSX } from "preact"
import {
  IconCalendarDays,
  IconEllipsisVertical,
  IconLens,
  IconList,
  IconSun,
} from "@spy4x/preact-icons"
import { RailShell, type RailShellItem } from "@spy4x/preact-system/rail-shell"

/** The page each destination opens. Kept here so the router and the navigation cannot drift. */
export const PATHS = {
  today: "/",
  upcoming: "/upcoming",
  lists: "/lists",
  search: "/search",
  more: "/settings",
} as const

/** The five destinations, in display order: the rail from `md` up, the tab bar below. */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: "today", label: "Today", path: PATHS.today, Icon: IconSun },
  { key: "upcoming", label: "Upcoming", path: PATHS.upcoming, Icon: IconCalendarDays },
  { key: "lists", label: "Lists", path: PATHS.lists, Icon: IconList },
  { key: "search", label: "Search", path: PATHS.search, Icon: IconLens },
  { key: "more", label: "More", path: PATHS.more, Icon: IconEllipsisVertical },
]

/** A destination: the rail shell's entry plus the path it opens. */
export interface NavItem extends RailShellItem {
  path: string
}

/** The navigation entry a path belongs to, or `undefined` for a path no entry owns. */
export function navKey(path: string | undefined): string | undefined {
  if (path === undefined) return undefined
  if (path === PATHS.today) return "today"
  for (const item of NAV_ITEMS) {
    if (item.path !== PATHS.today && (path === item.path || path.startsWith(`${item.path}/`))) {
      return item.key
    }
  }
  return undefined
}

/**
 * The app's frame: the rail from `md` up and the phone tab bar below, around the page. Every entry
 * is a link to its page, so it opens in a new tab and shows its address. A plain click goes
 * through `navigate`, which the router handles, so moving between pages never reloads the app;
 * without `navigate` the links load their pages.
 */
export function AppFrame(
  { currentPath, navigate, children }: {
    currentPath?: string
    navigate?: (path: string) => void
    children: ComponentChildren
  },
): JSX.Element {
  const items: readonly RailShellItem[] = NAV_ITEMS.map(({ key, label, Icon, path }) => ({
    key,
    label,
    Icon,
    href: path,
  }))
  return (
    <RailShell
      items={items}
      currentKey={navKey(currentPath)}
      navigateLink={navigate && ((_key, href) => navigate(href))}
    >
      {children}
    </RailShell>
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
