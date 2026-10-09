import { useSignal } from "@preact/signals"
import { QuickAddPriority, type QuickAddResult } from "@spy4x/platform"
import { IcalDateKind } from "@spy4x/time/ical"
import type { NewTaskFields } from "@spy4x/time/ical-tasks-edit"
import type { TaskDate } from "@spy4x/time/ical-tasks-model"
import { floatingDue } from "@ui/due-label.ts"
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

/** The iCalendar `PRIORITY` of each quick-add word, as Tasks.org writes it. */
const PRIORITY: Record<QuickAddPriority, number> = {
  [QuickAddPriority.High]: 1,
  [QuickAddPriority.Medium]: 5,
  [QuickAddPriority.Low]: 9,
}

/**
 * The task a parsed line stands for. A typed date wins; with none, `dueToday` dates it today. A
 * typed time is a floating wall clock, as the task editor writes a new time. A `@context`
 * is kept as a tag, so no typed word is lost.
 */
export function newTaskFromQuickAdd(
  parsed: QuickAddResult,
  options: { dueToday?: boolean; now: Date; zone: string },
): NewTaskFields {
  const { due, tags, contexts, priority } = parsed
  let taskDue: TaskDate | undefined
  if (due?.time !== undefined) taskDue = floatingDue(due.date, due.time)
  else if (due) taskDue = { kind: IcalDateKind.Date, date: due.date }
  else if (options.dueToday) {
    taskDue = { kind: IcalDateKind.Date, date: isoDateInTz(options.now, options.zone) }
  }
  const allTags = [...tags, ...contexts]
  return {
    title: parsed.title,
    ...(allTags.length ? { tags: allTags } : {}),
    ...(taskDue ? { due: taskDue } : {}),
    ...(priority !== undefined ? { priority: PRIORITY[priority] } : {}),
  }
}

/**
 * The quick add form's wiring: `add(parsed)` creates a task in `listHref` (the first list when none
 * is named) from a parsed line, due today when `dueToday` and the line names no date, and shows
 * why when it could not. `busy` is true while a request runs.
 */
export function useQuickAdd(options: { listHref?: string; dueToday?: boolean } = {}) {
  const busy = useSignal(false)
  async function add(parsed: QuickAddResult): Promise<void> {
    const target = quickAddTarget(taskLists.value, calendarsLoaded.value, options.listHref)
    if (`error` in target) {
      toasts.error({ title: ``, body: target.error })
      return
    }
    const { listHref } = target
    const fields = newTaskFromQuickAdd(parsed, {
      dueToday: options.dueToday,
      now: new Date(),
      zone: browserZone(),
    })
    busy.value = true
    try {
      const result = await addTask(fields, { listHref })
      if (result.kind === WriteKind.Failed) toasts.error({ title: ``, body: result.message })
    } finally {
      busy.value = false
    }
  }
  return { busy, add }
}
