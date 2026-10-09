import { useSignal } from "@preact/signals"
import { IcalDateKind } from "@spy4x/time/ical"
import type { TaskDate } from "@spy4x/time/ical-tasks-model"
import { calendarsLoaded } from "../state/calendars.ts"
import { taskLists } from "../state/task-lists.ts"
import { addTask } from "../state/task-writes.ts"
import { toasts } from "../state/toasts.ts"
import { WriteKind } from "../state/tasks.ts"
import { isoDateInTz } from "@spy4x/time/tz"
import { browserZone } from "./clock.ts"

/** Where a quick-added task goes: the named list, else the first one, or why there is none. */
export function quickAddTarget(
  lists: readonly { href: string }[],
  loaded: boolean,
  named?: string,
): { listHref: string } | { error: string } {
  const listHref = named ?? lists[0]?.href
  if (listHref) return { listHref }
  return {
    error: loaded
      ? `There is no list to add the task to yet.`
      : `Your lists are still loading. Try again in a moment.`,
  }
}

/**
 * The quick add form's wiring: `add(title)` creates a task in `listHref` (the first list when none
 * is named), due today when `dueToday`, and shows why when it could not. `busy` is true while a
 * request runs.
 */
export function useQuickAdd(options: { listHref?: string; dueToday?: boolean } = {}) {
  const busy = useSignal(false)
  async function add(title: string): Promise<void> {
    const target = quickAddTarget(taskLists.value, calendarsLoaded.value, options.listHref)
    if (`error` in target) {
      toasts.error({ title: ``, body: target.error })
      return
    }
    const { listHref } = target
    const due: TaskDate | undefined = options.dueToday
      ? { kind: IcalDateKind.Date, date: isoDateInTz(new Date(), browserZone()) }
      : undefined
    busy.value = true
    try {
      const result = await addTask({ title, ...(due ? { due } : {}) }, { listHref })
      if (result.kind === WriteKind.Failed) toasts.error({ title: ``, body: result.message })
    } finally {
      busy.value = false
    }
  }
  return { busy, add }
}
