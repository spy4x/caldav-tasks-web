import { IcalDateKind } from "@spy4x/time/ical"
import { AlarmRelated, AlarmTriggerKind } from "@spy4x/time/ical-tasks"
import { type Task, type TaskReminder, TaskStatus } from "@spy4x/time/ical-tasks-model"

/** The list the test tasks belong to unless a test says otherwise. */
export const FIXTURE_LIST_HREF = `/dav/tasks/home/`

/** A date-only due or start value. */
export function dateOnly(date: string): Task[`due`] {
  return { kind: IcalDateKind.Date, date }
}

/** A due or start value with a time, floating (the same wall clock in any zone). */
export function dateTime(date: string, time: string): Task[`due`] {
  return { kind: IcalDateKind.Floating, date, time }
}

/** A reminder with a relative trigger such as `-PT15M`, counted from the start unless `related` says. */
export function reminder(duration: string, related = AlarmRelated.Start): TaskReminder {
  return {
    trigger: duration,
    alarm: { kind: AlarmTriggerKind.Relative, duration, related },
  }
}

/**
 * An invented task for tests and screenshots, open and unprioritised unless `rest` says otherwise.
 * The raw iCalendar text is a stub: the screens never read it.
 */
export function makeTask(uid: string, title: string, rest: Partial<Task> = {}): Task {
  return {
    uid,
    href: `${FIXTURE_LIST_HREF}${uid}.ics`,
    etag: `"1"`,
    ics: ``,
    listHref: FIXTURE_LIST_HREF,
    title,
    notes: ``,
    status: TaskStatus.NeedsAction,
    priority: 0,
    tags: [],
    reminders: [],
    ...rest,
  }
}
