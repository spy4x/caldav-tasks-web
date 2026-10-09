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

/** Where a signed-out visitor is sent: the sign-in page, which remembers where they were going. */
export function signInPath(target: string): string {
  if (!isInternal(target) || target === ROUTES.today) return ROUTES.signIn
  return `${ROUTES.signIn}?next=${encodeURIComponent(target)}`
}

/** An address inside this app: it starts with one `/`, so it can never leave the site. */
function isInternal(target: string): boolean {
  return target.startsWith(`/`) && !target.startsWith(`//`) && !target.startsWith(`/\\`)
}

/**
 * Where to go after signing in: the `next` the sign-in address carries, or Today when it is
 * missing or points outside the app.
 */
export function nextPath(search: string): string {
  const next = new URLSearchParams(search).get(`next`)
  if (next === null || !isInternal(next)) return ROUTES.today
  const path = next.split(/[?#]/)[0]
  return path === ROUTES.signIn ? ROUTES.today : next
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
