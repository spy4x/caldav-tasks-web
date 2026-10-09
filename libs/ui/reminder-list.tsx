import type { JSX } from "preact"
import { describeAlarmTrigger } from "@spy4x/time/ical-tasks"
import { IconBell } from "@spy4x/preact-icons"
import type { TaskReminder } from "@tasks/types.ts"

/** Props of {@link ReminderList}. */
export interface ReminderListProps {
  /** The reminders the task carries, as `readTodo` returned them. */
  reminders: readonly TaskReminder[]
  /** The IANA zone a fixed reminder moment is shown in. Defaults to `UTC`. */
  timeZone?: string
}

/**
 * The task's reminders, read-only: v1 shows them so nobody wonders whether they exist, but changing
 * them stays in Tasks.org. Renders nothing for a task without reminders.
 *
 * Each trigger is described in words by `describeAlarmTrigger` ("15 minutes before due", "at
 * start"), so a reminder counted from the end reads differently from one counted from the start.
 * One the library cannot describe is shown as written (`-PT15M`).
 */
export function ReminderList(
  { reminders, timeZone = `UTC` }: ReminderListProps,
): JSX.Element | null {
  if (reminders.length === 0) return null
  return (
    <section aria-labelledby="task-reminders-heading" data-e2e="task-reminders">
      <h2 id="task-reminders-heading" class="pc-label">Reminders</h2>
      <ul class="mt-2 space-y-1 text-sm text-muted">
        {reminders.map((reminder, index) => (
          <li key={index} class="flex items-center gap-2" data-e2e="task-reminder">
            <IconBell class="size-4" aria-hidden="true" />
            {describeAlarmTrigger(reminder.alarm, { timeZone }) ?? <code>{reminder.trigger}</code>}
          </li>
        ))}
      </ul>
      <p class="mt-2 text-sm text-muted">Reminders are changed in Tasks.org.</p>
    </section>
  )
}
