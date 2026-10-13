import { PATHS } from "@ui/frame.tsx"
import type { Task, TaskList } from "@spy4x/time/ical-tasks-model"
import { findListBySlug, ROUTES } from "./routes.ts"

/** The app's name: the whole tab title while a page has no name yet, and the end of every other. */
export const APP_TITLE = `Tasks`

/** What the title of a list or a task page is read from. */
export interface PageTitleData {
  lists: readonly Pick<TaskList, `href` | `name`>[]
  tasks: readonly Pick<Task, `uid` | `title`>[]
  /** Whether the lists and tasks are known yet. Until then a missing one is not "Not found". */
  loaded: boolean
}

/** One path segment as it was before the address encoded it; kept as typed when it cannot be decoded. */
function decoded(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/** The name of the page at `path`, or `undefined` while a list or task page is still loading. */
function pageName(path: string, { lists, tasks, loaded }: PageTitleData): string | undefined {
  switch (path) {
    case PATHS.today:
      return `Today`
    case PATHS.upcoming:
      return `Upcoming`
    case PATHS.lists:
      return `Lists`
    case PATHS.search:
      return `Search`
    case PATHS.more:
      return `Settings`
    case ROUTES.newList:
      return `New list`
  }
  const [area, name, rest, ...more] = path.split(`/`).filter(Boolean).map(decoded)
  const missing = loaded ? `Not found` : undefined
  if (area === `tasks` && name !== undefined && rest === undefined) {
    const task = tasks.find((candidate) => candidate.uid === name)
    // A task with no title still has a page: it is named as its heading names it.
    return task ? task.title || `Edit task` : missing
  }
  if (area === `lists` && name !== undefined && more.length === 0) {
    const list = findListBySlug(lists, name)
    if (rest === undefined) return list?.name ?? missing
    if (rest === `settings`) return list ? `List settings · ${list.name}` : missing
  }
  return `Not found`
}

/**
 * The browser tab's title for the page at `path`: the page's name, then the app's, so a row of
 * tabs and the history list tell the pages apart. A list page is named after its list and a task
 * page after its task. `path` is the address as the browser holds it, still percent-encoded.
 */
export function pageTitle(path: string, data: PageTitleData): string {
  const name = pageName(path, data)
  return name ? `${name} · ${APP_TITLE}` : APP_TITLE
}
