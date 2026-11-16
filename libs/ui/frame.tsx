import type { ComponentChildren, ComponentType, JSX } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"
import {
  IconCalendarDays,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
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

/** The `localStorage` key that remembers the sidebar was hidden. */
const SIDEBAR_HIDDEN = `sidebar-hidden`

function readHidden(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_HIDDEN) === `1`
  } catch {
    return false
  }
}

/**
 * The app's frame: the caller's `sidebar` on the left from `md` up, headed by the name and
 * Search, the page in `<main>`, and a tab bar of the five destinations on a phone. The sidebar
 can be hidden, and stays hidden on this browser; the frame then carries
 `data-sidebar-hidden`, which a screen reads (`group-data-[sidebar-hidden]/frame:`) to show its
 own quick add.
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
  const [hidden, setHidden] = useState(readHidden)
  const toggle = (next: boolean) => {
    setHidden(next)
    try {
      localStorage.setItem(SIDEBAR_HIDDEN, next ? `1` : `0`)
    } catch {
      // Not remembered in a private window; it still toggles.
    }
    toggled.current = true
  }
  // The button pressed goes away; keep the keyboard on the one that replaces it.
  const toggled = useRef(false)
  const hideButton = useRef<HTMLButtonElement>(null)
  const showButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (toggled.current) (hidden ? showButton : hideButton).current?.focus()
  }, [hidden])
  const logo = (withName: boolean) => (
    <AppLink
      href={PATHS.today}
      navigate={navigate}
      class="flex items-center gap-3 font-heading text-lg font-semibold"
    >
      <span class="flex size-7 items-center justify-center rounded-md bg-accent text-accent-foreground">
        <IconCheck class="size-4" aria-hidden="true" />
      </span>
      {withName ? `To do` : <span class="sr-only">To do</span>}
    </AppLink>
  )
  const search = (wide: boolean) => (
    <AppLink
      href={PATHS.search}
      navigate={navigate}
      aria-label="Search tasks"
      class="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-muted hover:bg-hover hover:text-foreground"
      data-e2e="header-search"
    >
      <IconLens class="size-4" aria-hidden="true" />
      {wide && <span>Search tasks</span>}
      <kbd
        class="rounded border border-subtle px-1 font-sans text-xs"
        aria-hidden="true"
      >
        /
      </kbd>
    </AppLink>
  )
  return (
    <div
      data-sidebar-hidden={sidebar && hidden ? `` : undefined}
      class="group/frame flex min-h-dvh flex-col bg-canvas text-foreground"
    >
      <a
        href="#main"
        class="sr-only focus:not-sr-only focus:absolute focus:z-30 focus:m-2 focus:rounded-md focus:bg-surface focus:p-2"
      >
        Skip to content
      </a>
      <div class="flex flex-1">
        {sidebar && !hidden && (
          <aside
            class="hidden w-90 shrink-0 border-r border-subtle bg-surface md:block"
            data-e2e="sidebar"
          >
            <div class="px-6 pt-6 pb-8">
              <div class="mb-8 flex items-center gap-1">
                {logo(true)}
                <span class="ms-auto" />
                {search(false)}
                <button
                  type="button"
                  aria-label="Hide sidebar"
                  title="Hide sidebar"
                  aria-expanded="true"
                  class="flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-foreground"
                  ref={hideButton}
                  onClick={() => toggle(true)}
                  data-e2e="sidebar-hide"
                >
                  <IconChevronLeft class="size-4" aria-hidden="true" />
                </button>
              </div>
              {sidebar}
            </div>
          </aside>
        )}
        {sidebar && hidden && (
          <div
            class="hidden w-20 shrink-0 flex-col items-center border-r border-subtle bg-surface md:flex"
            data-e2e="sidebar-rail"
          >
            <div class="flex h-18 w-full items-center justify-center border-b border-subtle">
              {logo(false)}
            </div>
            <button
              type="button"
              aria-label="Show sidebar"
              title="Show sidebar"
              aria-expanded="false"
              class="mt-4 flex size-11 items-center justify-center rounded-lg border border-subtle bg-surface text-foreground shadow-sm hover:bg-hover"
              ref={showButton}
              onClick={() => toggle(false)}
              data-e2e="sidebar-show"
            >
              <IconChevronRight class="size-4" aria-hidden="true" />
            </button>
          </div>
        )}
        <main id="main" tabindex={-1} class="min-w-0 flex-1 pb-16 outline-none md:pb-0">
          {sidebar && hidden && (
            <div class="hidden justify-end px-12 pt-2 md:flex">{search(true)}</div>
          )}
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
