/**
 * The smart views: Today with its overdue tasks, and Upcoming. Days are the viewer's, so both take
 * the current moment and the viewer's time zone as arguments and never read the clock.
 *
 * Only tasks that still need doing appear. A repeating task is shown where its due value says; the
 * next occurrence is not computed here.
 */

import { addDays, isoDateInTz } from "@spy4x/time/tz"
import { IcalDateKind } from "@spy4x/time/ical"
import { dateDay, dateInstant, isOpen } from "./model.ts"
import { sortTasks } from "./sort.ts"
import { SortMode, type Task, type TaskDate } from "./types.ts"

/** How many days after today the Upcoming view reaches. */
export const UPCOMING_DAYS = 14

/** The Today view. */
export interface TodayView {
  /** Open tasks whose due value has passed, earliest first, across all lists. */
  overdue: Task[]
  /** Open tasks due later today, earliest first. */
  today: Task[]
}

/** The tasks due on one day of the Upcoming view. */
export interface UpcomingDay {
  /** `YYYY-MM-DD` in the viewer's zone. */
  date: string
  tasks: Task[]
}

/**
 * Whether a due value has passed. A date is overdue from the day after it; a time is overdue the
 * moment it passes, as Tasks.org colours it.
 */
export function isOverdue(due: TaskDate, now: Date, zone: string): boolean {
  if (due.kind === IcalDateKind.Date) return due.date < isoDateInTz(now, zone)
  return dateInstant(due, zone).getTime() < now.getTime()
}

/** Overdue above today. A task due today whose time has passed counts as overdue. */
export function todayView(tasks: readonly Task[], now: Date, zone: string): TodayView {
  const todayDate = isoDateInTz(now, zone)
  const overdue: Task[] = []
  const today: Task[] = []
  for (const task of tasks) {
    if (!isOpen(task) || !task.due) continue
    if (isOverdue(task.due, now, zone)) overdue.push(task)
    else if (dateDay(task.due, zone) === todayDate) today.push(task)
  }
  return {
    overdue: sortTasks(overdue, SortMode.Due, zone),
    today: sortTasks(today, SortMode.Due, zone),
  }
}

/**
 * Tomorrow through {@link UPCOMING_DAYS} days after today, one entry per day that has tasks, in
 * date order. Tasks inside a day are earliest first.
 */
export function upcomingView(tasks: readonly Task[], now: Date, zone: string): UpcomingDay[] {
  const first = addDays(isoDateInTz(now, zone), 1)
  const last = addDays(first, UPCOMING_DAYS - 1)
  const byDay = new Map<string, Task[]>()
  for (const task of tasks) {
    if (!isOpen(task) || !task.due) continue
    const day = dateDay(task.due, zone)
    if (day < first || day > last) continue
    byDay.set(day, [...(byDay.get(day) ?? []), task])
  }
  return [...byDay.keys()].sort().map((date) => ({
    date,
    tasks: sortTasks(byDay.get(date)!, SortMode.Due, zone),
  }))
}
