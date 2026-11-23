import { useNow } from "@spy4x/preact-signals/now"
import { useEffect } from "preact/hooks"
import { useLocation } from "wouter-preact"
import { SortMode, sortTasks, todayView } from "@spy4x/platform/universal/ical-tasks-view"
import { isOpen, type Task } from "@spy4x/time/ical-tasks-model"
import { TodayScreen } from "@ui/today-screen.tsx"
import { calendarsLoaded } from "../state/calendars.ts"
import { taskLists } from "../state/task-lists.ts"
import { tasks } from "../state/tasks.ts"
import { homeList } from "../state/home-list.ts"
import { listPath, taskPath } from "../routes.ts"
import { browserZone } from "./clock.ts"
import { completeWithUndo, deleteWithUndo, moveUnder, renameTask } from "./task-actions.ts"
import { toasts } from "../state/toasts.ts"
import { useQuickAdd } from "./use-quick-add.ts"

/**
 * True once the first visit has had its chance to open the default list (Settings), or when it
 * started elsewhere. The Today tab still shows Today once the app is open.
 */
let homeHandled = globalThis.location?.pathname !== `/`

/** Today, wired: what is overdue or due today, with a quick add that dates the task today. */
export function TodayView() {
  const [, navigate] = useLocation()
  const quickAdd = useQuickAdd({ dueToday: true })
  const zone = browserZone()
  const now = useNow({ zone }).value
  const { overdue, today } = todayView(tasks.value, now, zone)
  useEffect(() => {
    if (homeHandled || !calendarsLoaded.value) return
    homeHandled = true
    const home = homeList(taskLists.value)
    if (home) navigate(listPath(home), { replace: true })
  }, [calendarsLoaded.value])
  return (
    <TodayScreen
      overdue={overdue}
      today={today}
      lists={taskLists.value}
      zone={zone}
      now={now}
      loading={!calendarsLoaded.value}
      onComplete={(task, done) => void completeWithUndo(task, done)}
      onOpen={(task) => navigate(taskPath(task))}
      onRenameTask={(task, title) => void renameTask(task, title)}
      onDeleteTask={(task) => void deleteWithUndo(task)}
      onMoveTask={(task, parent) => void nestOnToday(task, parent, zone)}
      onQuickAdd={(parsed) => void quickAdd.add(parsed)}
      quickAddBusy={quickAdd.busy.value}
    />
  )
}

/**
 * A drag on Today put `task` under `parent`, or out to the top level. Only tasks of one list nest,
 * as Tasks.org links them. The task goes last among its new siblings in its list's own manual
 * order, which Today does not show, so that order is otherwise kept.
 */
export async function nestOnToday(task: Task, parent: Task | undefined, zone: string) {
  if (parent && parent.listHref !== task.listHref) {
    toasts.error({ title: ``, body: `Only tasks in the same list can be nested.` })
    return
  }
  const siblings = sortTasks(
    tasks.value.filter((each) =>
      each.listHref === task.listHref && each.parentUid === parent?.uid &&
      each.uid !== task.uid && isOpen(each)
    ),
    SortMode.Manual,
    zone,
  )
  await moveUnder(task.listHref, task, parent, siblings, siblings.length, zone)
}
