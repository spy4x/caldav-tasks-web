import type { JSX } from "preact"
import { IconBell } from "@spy4x/preact-icons"
import type { TaskReminder } from "@tasks/types.ts"

/** Props of {@link ReminderList}. */
export interface ReminderListProps {
  /** The reminders the task carries, as `readTodo` returned them. */
  reminders: readonly TaskReminder[]
}

/**
 * The task's reminders, read-only: v1 shows them so nobody wonders whether they exist, but changing
 * them stays in Tasks.org. Renders nothing for a task without reminders.
 *
 * Each trigger is shown as written (`-PT15M`, or `20261010T080000Z` for a fixed moment).
 * TODO: describe them in words ("15 minutes before due") once `@spy4x/time/ical-tasks` has a
 * describer for an alarm trigger; it is a library gap, so no local formatter lives here.
 */
export function ReminderList({ reminders }: ReminderListProps): JSX.Element | null {
  if (reminders.length === 0) return null
  return (
    <section aria-labelledby="task-reminders-heading" data-e2e="task-reminders">
      <h2 id="task-reminders-heading" class="pc-label">Reminders</h2>
      <ul class="mt-2 space-y-1 text-sm text-muted">
        {reminders.map((reminder, index) => (
          <li key={index} class="flex items-center gap-2" data-e2e="task-reminder">
            <IconBell class="size-4" aria-hidden="true" />
            <code>{reminder.trigger}</code>
          </li>
        ))}
      </ul>
      <p class="mt-2 text-sm text-muted">Reminders are changed in Tasks.org.</p>
    </section>
  )
}
