import { PATHS } from "@ui/frame.tsx"
import type { Task, TaskList } from "@tasks/types.ts"
import { SessionStatus } from "./state/session.ts"

/** Every address the app answers, as the router reads them. */
export const ROUTES = {
  signIn: `/sign-in`,
  today: PATHS.today,
  upcoming: PATHS.upcoming,
  lists: PATHS.lists,
  list: `/lists/:slug`,
  task: `/tasks/:uid`,
  search: PATHS.search,
  settings: PATHS.more,
} as const

/**
 * The part of a list's address that names it: the last segment of its CalDAV path, so the address
 * reads `/lists/errands` and not a percent-encoded server path.
 */
export function listSlug(listHref: string): string {
  return listHref.split(`/`).filter(Boolean).at(-1) ?? listHref
}

/** The address of a list's page. */
export function listPath(list: Pick<TaskList, `href`> | string): string {
  const href = typeof list === `string` ? list : list.href
  return `/lists/${encodeURIComponent(listSlug(href))}`
}

/** The address of a task's editor. */
export function taskPath(task: Pick<Task, `uid`>): string {
  return `/tasks/${encodeURIComponent(task.uid)}`
}

/** The list a `/lists/:slug` address names, or `undefined`. */
export function findListBySlug<T extends { href: string }>(
  lists: readonly T[],
  slug: string,
): T | undefined {
  return lists.find((list) => listSlug(list.href) === slug)
}

/** A stand-in origin to resolve addresses against, so any other origin shows up as foreign. */
const APP_ORIGIN = `http://app.invalid`

/**
 * The address inside this app that `target` resolves to, or `null` when it would leave the site.
 * It parses the way a browser does (which drops tabs and newlines and reads `\` as `/`), so a
 * disguised `//host` cannot pass a check that only looked at the first characters.
 */
function internalTarget(target: string): string | null {
  let url: URL
  try {
    url = new URL(target, APP_ORIGIN)
  } catch {
    return null
  }
  if (url.origin !== APP_ORIGIN) return null
  return `${url.pathname}${url.search}${url.hash}`
}

/** Where a signed-out visitor is sent: the sign-in page, which remembers where they were going. */
export function signInPath(target: string): string {
  const inside = internalTarget(target)
  if (inside === null || inside === ROUTES.today) return ROUTES.signIn
  return `${ROUTES.signIn}?next=${encodeURIComponent(inside)}`
}

/**
 * Where to go after signing in: the `next` the sign-in address carries, or Today when it is
 * missing or points outside the app.
 */
export function nextPath(search: string): string {
  const next = new URLSearchParams(search).get(`next`)
  const inside = next === null ? null : internalTarget(next)
  if (inside === null || new URL(inside, APP_ORIGIN).pathname === ROUTES.signIn) {
    return ROUTES.today
  }
  return inside
}

/**
 * The address the sign-in gate redirects to, or `null` to stay put. A signed-out visitor on any
 * page goes to Sign in; a signed-in person on Sign in goes on to where they were heading. Nothing
 * moves until the server has answered.
 */
export function gateRedirect(
  status: SessionStatus,
  path: string,
  search: string,
): string | null {
  const onSignIn = path === ROUTES.signIn
  if (status === SessionStatus.SignedOut && !onSignIn) {
    return signInPath(search ? `${path}?${search.replace(/^\?/, ``)}` : path)
  }
  if (status === SessionStatus.SignedIn && onSignIn) return nextPath(search)
  return null
}
