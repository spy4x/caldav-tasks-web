/**
 * Turns the raw iCalendar text of a task into the `Task` the screens use. The parsing is
 * `@spy4x/time/ical`'s job; this file only maps its result to the app's types and keeps the raw
 * text, so an edit can patch it later.
 */

import { IcalDateKind, parseIcal, resolveInstant } from "@spy4x/time/ical"
import { AlarmTriggerKind, readTodo, type Todo, TodoStatus } from "@spy4x/time/ical-tasks"
import { isoDateInTz } from "@spy4x/time/tz"
import { PriorityBand, type Task, type TaskDate, type TaskReminder, TaskStatus } from "./types.ts"

/** What the CalDAV server hands over for one task. */
export interface TaskSource {
  href: string
  etag: string
  /** The `href` of the list the task lives in. */
  listHref: string
  /** The iCalendar text of the task's resource. */
  ics: string
}

/** The result of {@link parseTask}: the task, or a message that says why there is none. */
export type ParseTaskResult =
  | { success: true; output: Task; error: null }
  | { success: false; output: null; error: string }

const STATUS: Record<TodoStatus, TaskStatus> = {
  [TodoStatus.NeedsAction]: TaskStatus.NeedsAction,
  [TodoStatus.InProcess]: TaskStatus.InProcess,
  [TodoStatus.Completed]: TaskStatus.Completed,
  [TodoStatus.Cancelled]: TaskStatus.Cancelled,
}

/**
 * Reads one task. A resource with no VTODO, or with one that has no `UID`, is a failure with a
 * message, never a throw: one odd resource must not take the whole list down.
 */
export function parseTask(source: TaskSource): ParseTaskResult {
  const parsed = parseIcal(source.ics)
  if (!parsed.success) return { success: false, output: null, error: parsed.error.message }
  const todo = readTodo(parsed.output)
  if (!todo) return { success: false, output: null, error: `No VTODO in ${source.href}` }
  if (!todo.uid) return { success: false, output: null, error: `No UID in ${source.href}` }
  return { success: true, output: toTask(todo, todo.uid, source), error: null }
}

function toTask(todo: Todo, uid: string, source: TaskSource): Task {
  const task: Task = {
    uid,
    href: source.href,
    etag: source.etag,
    ics: source.ics,
    listHref: source.listHref,
    title: todo.summary ?? ``,
    notes: todo.description ?? ``,
    // A task with no STATUS is open, as Tasks.org reads it.
    status: todo.status ? STATUS[todo.status] : TaskStatus.NeedsAction,
    priority: todo.priority ?? 0,
    tags: todo.categories,
    reminders: todo.alarms.flatMap(toReminder),
  }
  if (todo.due) task.due = todo.due
  if (todo.start) task.start = todo.start
  // Only a parent link makes a subtask; CHILD and SIBLING links say nothing about this task's own
  // parent.
  const parent = todo.relatedTo.find((link) => link.type === `PARENT`)
  if (parent) task.parentUid = parent.uid
  if (todo.sortOrder !== undefined) task.sortOrder = todo.sortOrder
  if (todo.rrule) task.repeatRule = todo.rrule
  return task
}

function toReminder(alarm: Todo[`alarms`][number]): TaskReminder[] {
  const trigger = alarm.trigger
  if (!trigger) return []
  if (trigger.kind === AlarmTriggerKind.Relative) return [{ trigger: trigger.duration }]
  const { date, time = `00:00:00` } = trigger.at
  return [{ trigger: `${date.replace(/-/g, ``)}T${time.replace(/:/g, ``)}Z` }]
}

/** Tasks.org's grouping of the iCalendar priority: 1 to 4 high, 5 medium, 6 to 9 low, 0 none. */
export function priorityBand(priority: number): PriorityBand {
  if (priority >= 1 && priority <= 4) return PriorityBand.High
  if (priority === 5) return PriorityBand.Medium
  if (priority >= 6 && priority <= 9) return PriorityBand.Low
  return PriorityBand.None
}

/** Whether the task still needs doing: not completed and not cancelled. */
export function isOpen(task: Task): boolean {
  return task.status === TaskStatus.NeedsAction || task.status === TaskStatus.InProcess
}

/**
 * The instant a due or start value denotes for a viewer in `zone`. A date is midnight of that day
 * and a floating time is that wall clock, both in `zone`; a UTC time is itself; a zoned time keeps
 * its own zone. A zoned value whose `TZID` this runtime does not know (a vendor name such as
 * `W. Europe Standard Time`) is read as a wall clock in `zone`, so it still lands on a day and
 * never disappears from a view.
 */
export function dateInstant(value: TaskDate, zone: string): Date {
  const exact = resolveInstant(value, { zone })
  if (exact) return exact
  const wallClock = resolveInstant({ ...value, kind: IcalDateKind.Floating, tzid: undefined }, {
    zone,
  })
  // Reached only for a corrupt value, such as an impossible date; far in the future keeps the task
  // visible in lists and out of every date view.
  return wallClock ?? new Date(8.64e15)
}

/**
 * The calendar day (`YYYY-MM-DD`) on which a due or start value falls for a viewer in `zone`.
 * A date and a floating time stay on the day they are written; a UTC or zoned time is converted
 * to `zone`.
 */
export function dateDay(value: TaskDate, zone: string): string {
  if (value.kind === IcalDateKind.Date || value.kind === IcalDateKind.Floating) return value.date
  return isoDateInTz(dateInstant(value, zone), zone)
}
