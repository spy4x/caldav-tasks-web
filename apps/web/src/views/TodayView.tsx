import { useLocation } from "wouter-preact"
import { todayView } from "@spy4x/platform/universal/ical-tasks-view"
import { TodayScreen } from "@ui/today-screen.tsx"
import { calendarsLoaded } from "../state/calendars.ts"
import { taskLists } from "../state/task-lists.ts"
import { tasks } from "../state/tasks.ts"
import { taskPath } from "../routes.ts"
import { browserZone } from "./clock.ts"
import { completeWithUndo } from "./task-actions.ts"
import { useQuickAdd } from "./use-quick-add.ts"

/** Today, wired: what is overdue or due today, with a quick add that dates the task today. */
export function TodayView() {
  const [, navigate] = useLocation()
  const quickAdd = useQuickAdd({ dueToday: true })
  const zone = browserZone()
  const now = new Date()
  const { overdue, today } = todayView(tasks.value, now, zone)
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
      onQuickAdd={(title) => void quickAdd.add(title)}
      quickAddBusy={quickAdd.busy.value}
    />
  )
}
