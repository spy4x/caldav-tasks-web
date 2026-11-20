import type { ComponentChildren, ComponentType, JSX } from "preact"
import {
  IconCalendarDays,
  IconCheck,
  IconEllipsisVertical,
  IconLens,
  IconList,
  type IconProps,
  IconSun,
} from "@spy4x/preact-icons"

/** The page each destination opens. Kept here so the router and the navigation cannot drift. */
export const PATHS = {
  today: "/",
  upcoming: "/upcoming",
  lists: "/lists",
  search: "/search",
  more: "/settings",
} as const

/** A destination of the phone tab bar. */
export interface NavItem {
  key: string
  label: string
  path: string
  Icon: ComponentType<IconProps>
}

/** The five destinations of the phone tab bar, in display order. */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: "today", label: "Today", path: PATHS.today, Icon: IconSun },
  { key: "upcoming", label: "Upcoming", path: PATHS.upcoming, Icon: IconCalendarDays },
  { key: "lists", label: "Lists", path: PATHS.lists, Icon: IconList },
  { key: "search", label: "Search", path: PATHS.search, Icon: IconLens },
  { key: "more", label: "More", path: PATHS.more, Icon: IconEllipsisVertical },
]

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
 * A link that goes through the app's router on a plain left click and stays the browser's for
 * every other click, so "open in a new tab" still works. Without `navigate` it is a plain link.
 */
export function AppLink(
  { href, navigate, ...rest }: JSX.HTMLAttributes<HTMLAnchorElement> & {
    href: string
    navigate?: (path: string) => void
  },
): JSX.Element {
  return (
    <a
      {...rest}
      href={href}
      onClick={(event) => {
        if (
          !navigate || event.defaultPrevented || event.button !== 0 || event.ctrlKey ||
          event.metaKey || event.shiftKey || event.altKey
        ) return
        event.preventDefault()
        navigate(href)
      }}
    />
  )
}

/**
 * The app's frame: the caller's `sidebar` on the left from `md` up, headed by the name and
 * Search, the page in `<main>`, and a tab bar of the five destinations on a phone.
 */
export function AppFrame(
  { currentPath, navigate, sidebar, children }: {
    currentPath?: string
    navigate?: (path: string) => void
    /** The desktop column: the new task form and the lists. Hidden on a phone. */
    sidebar?: ComponentChildren
    children: ComponentChildren
  },
): JSX.Element {
  const current = navKey(currentPath)
  return (
    <div class="flex min-h-dvh flex-col bg-canvas text-foreground">
      <a
        href="#main"
        class="sr-only focus:not-sr-only focus:absolute focus:z-30 focus:m-2 focus:rounded-md focus:bg-surface focus:p-2"
      >
        Skip to content
      </a>
      <div class="flex flex-1">
        {sidebar && (
          <aside
            class="hidden w-90 shrink-0 border-r border-subtle bg-surface md:block"
            data-e2e="sidebar"
          >
            <div class="px-6 pt-6 pb-8">
              <div class="mb-8 flex items-center justify-between gap-2">
                <AppLink
                  href={PATHS.today}
                  navigate={navigate}
                  class="flex items-center gap-3 font-heading text-lg font-semibold"
                >
                  <span class="flex size-7 items-center justify-center rounded-md bg-accent text-accent-foreground">
                    <IconCheck class="size-4" aria-hidden="true" />
                  </span>
                  To do
                </AppLink>
                <AppLink
                  href={PATHS.search}
                  navigate={navigate}
                  aria-label="Search tasks"
                  class="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-muted hover:bg-hover hover:text-foreground"
                  data-e2e="header-search"
                >
                  <IconLens class="size-4" aria-hidden="true" />
                  <kbd
                    class="rounded border border-subtle px-1 font-sans text-xs"
                    aria-hidden="true"
                  >
                    /
                  </kbd>
                </AppLink>
              </div>
              {sidebar}
            </div>
          </aside>
        )}
        <main id="main" tabindex={-1} class="min-w-0 flex-1 pb-16 outline-none md:pb-0">
          {children}
        </main>
      </div>
      <nav
        aria-label="Main navigation"
        class="fixed inset-x-0 bottom-0 z-20 flex h-16 border-t border-subtle bg-surface md:hidden"
        data-e2e="tab-bar"
      >
        {NAV_ITEMS.map(({ key, label, path, Icon }) => (
          <AppLink
            key={key}
            href={path}
            navigate={navigate}
            aria-current={current === key ? "page" : undefined}
            class={`flex flex-1 flex-col items-center justify-center gap-1 text-xs ${
              current === key ? "text-accent-text font-medium" : "text-muted"
            }`}
            data-e2e="tab"
          >
            <Icon class="size-5" aria-hidden="true" />
            {label}
          </AppLink>
        ))}
      </nav>
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
