import { computed } from "@preact/signals"
import { isOpen } from "@tasks/model.ts"
import type { TaskList } from "@tasks/types.ts"
import { calendars } from "./calendars.ts"
import { tasks } from "./tasks.ts"

/** Every list as the screens show it: name, colour and the number of tasks not yet completed. */
export const taskLists = computed<TaskList[]>(() => {
  const open = new Map<string, number>()
  for (const task of tasks.value) {
    if (isOpen(task)) open.set(task.listHref, (open.get(task.listHref) ?? 0) + 1)
  }
  return calendars.value.map((calendar) => ({
    href: calendar.href,
    name: calendar.displayName,
    ...(calendar.color ? { color: calendar.color } : {}),
    openCount: open.get(calendar.href) ?? 0,
  }))
})

/** Every tag in use, sorted, for the editor's suggestions. */
export const allTags = computed<string[]>(() =>
  [...new Set(tasks.value.flatMap((task) => task.tags))].sort((a, b) => a.localeCompare(b))
)
