import { useSignal } from "@preact/signals"
import { parseQuickAdd } from "@spy4x/platform"
import { IcalDateKind } from "@spy4x/time/ical"
import { isOpen, type Task } from "@spy4x/time/ical-tasks-model"
import { todayView } from "@spy4x/platform/universal/ical-tasks-view"
import { PATHS } from "@ui/frame.tsx"
import { type NewTaskInput, Sidebar, type SidebarLink } from "@ui/sidebar.tsx"
import { findListBySlug, listPath, ROUTES } from "../routes.ts"
import { taskLists } from "../state/task-lists.ts"
import { addTask } from "../state/task-writes.ts"
import { tasks, WriteKind } from "../state/tasks.ts"
import { toasts } from "../state/toasts.ts"
import { browserZone } from "./clock.ts"
import { homeList } from "./TodayView.tsx"
import { namedParent, newTaskFromQuickAdd } from "./use-quick-add.ts"

/**
 * The sidebar, wired: a new task goes into the list on screen, or the home list (Daily) anywhere
 * else. Its text is read like the quick add's (a date, `!high`, `#tag`), and it can be nested
 * under one of that list's open top-level tasks, which is created first when named but missing.
 */
export function SidebarView(
  { currentPath, navigate }: { currentPath: string; navigate: (path: string) => void },
) {
  const busy = useSignal(false)
  const lists = taskLists.value
  const slug = /^\/lists\/([^/]+)$/.exec(currentPath)?.[1]
  let onScreen = undefined
  if (slug) {
    try {
      onScreen = findListBySlug(lists, decodeURIComponent(slug))
    } catch {
      onScreen = undefined
    }
  }
  const target = onScreen ?? homeList(lists) ?? lists[0]
  const parents = target
    ? tasks.value.filter((t) => t.listHref === target.href && isOpen(t) && !t.parentUid)
    : []
  const zone = browserZone()
  const { overdue, today } = todayView(tasks.value, new Date(), zone)

  const links: SidebarLink[] = [
    { label: `Today`, href: PATHS.today, count: overdue.length + today.length },
    { label: `Upcoming`, href: PATHS.upcoming },
    ...lists.map((list) => ({
      label: list.name,
      href: listPath(list),
      color: list.color,
      count: list.openCount,
    })),
  ]

  async function add(input: NewTaskInput): Promise<boolean> {
    if (!target) {
      toasts.error({ title: ``, body: `There is no list to add the task to yet.` })
      return false
    }
    const now = new Date()
    const read = newTaskFromQuickAdd(parseQuickAdd(input.text, { now, timeZone: zone }), {
      now,
      zone,
    })
    const fields = {
      ...read,
      // Text that was only a date ("Friday") keeps its words as the title.
      title: read.title || input.text,
      ...(input.due ? { due: { kind: IcalDateKind.Date, date: input.due } } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
    }
    busy.value = true
    try {
      let parent: Task | undefined = parents.find((p) => p.uid === input.parentUid)
      if (!parent && input.parentTitle) {
        const found = await namedParent(target.href, input.parentTitle)
        if (`error` in found) {
          toasts.error({ title: ``, body: found.error })
          return false
        }
        parent = found.parent
      }
      const result = await addTask(fields, { listHref: target.href, parent })
      if (result.kind === WriteKind.Failed) {
        toasts.error({ title: ``, body: result.message })
        return false
      }
      return true
    } finally {
      busy.value = false
    }
  }

  return (
    <Sidebar
      currentPath={currentPath}
      links={links}
      newListHref={ROUTES.newList}
      settingsHref={PATHS.more}
      parents={parents}
      zone={zone}
      busy={busy.value}
      onAdd={add}
      navigate={navigate}
    />
  )
}
