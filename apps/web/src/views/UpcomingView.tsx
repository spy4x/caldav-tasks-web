import { useLocation } from "wouter-preact"
import { upcomingView } from "@spy4x/platform/universal/ical-tasks-view"
import { UpcomingScreen } from "@ui/upcoming-screen.tsx"
import { calendarsLoaded } from "../state/calendars.ts"
import { taskLists } from "../state/task-lists.ts"
import { tasks } from "../state/tasks.ts"
import { taskPath } from "../routes.ts"
import { browserZone } from "./clock.ts"
import { completeWithUndo } from "./task-actions.ts"

/** Upcoming, wired: the next two weeks, day by day. */
export function UpcomingView() {
  const [, navigate] = useLocation()
  const zone = browserZone()
  const now = new Date()
  return (
    <UpcomingScreen
      days={upcomingView(tasks.value, now, zone)}
      lists={taskLists.value}
      zone={zone}
      now={now}
      loading={!calendarsLoaded.value}
      onComplete={(task, done) => void completeWithUndo(task, done)}
      onOpen={(task) => navigate(taskPath(task))}
    />
  )
}
