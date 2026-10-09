import { useSignal } from "@preact/signals"
import { IcalDateKind } from "@tasks/types.ts"
import type { TaskDate } from "@tasks/types.ts"
import { taskLists } from "../state/task-lists.ts"
import { addTask } from "../state/task-writes.ts"
import { toasts } from "../state/toasts.ts"
import { WriteKind } from "../state/tasks.ts"
import { browserZone, todayIn } from "./clock.ts"

/**
 * The quick add form's wiring: `add(title)` creates a task in `listHref` (the first list when none
 * is named), due today when `dueToday`, and shows why when it could not. `busy` is true while a
 * request runs.
 */
export function useQuickAdd(options: { listHref?: string; dueToday?: boolean } = {}) {
  const busy = useSignal(false)
  async function add(title: string): Promise<void> {
    const listHref = options.listHref ?? taskLists.value[0]?.href
    if (!listHref) {
      toasts.error({ title: ``, body: `There is no list to add the task to yet.` })
      return
    }
    const due: TaskDate | undefined = options.dueToday
      ? { kind: IcalDateKind.Date, date: todayIn(browserZone()) }
      : undefined
    busy.value = true
    try {
      const result = await addTask({ title, ...(due ? { due } : {}) }, { listHref })
      if (result.kind === WriteKind.Offline) toasts.error({ title: ``, body: result.notice })
      if (result.kind === WriteKind.Failed) toasts.error({ title: ``, body: result.message })
    } finally {
      busy.value = false
    }
  }
  return { busy, add }
}
