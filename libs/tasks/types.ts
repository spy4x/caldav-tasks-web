/**
 * The task types screens and logic share. They describe what a screen shows; reading a task out of
 * iCalendar text and writing it back is the job of `@spy4x/time/ical`, and the text itself travels
 * with the task so an edit can patch it without losing what this file does not model.
 */

/** A task's state, as a VTODO `STATUS` says it. */
export enum TaskStatus {
  NeedsAction = 1,
  InProcess,
  Completed,
  Cancelled,
}

/** How Tasks.org groups the iCalendar priority numbers 1 to 9 (0 is none). */
export enum PriorityBand {
  None = 1,
  Low,
  Medium,
  High,
}

/** How a list shows its tasks. */
export enum SortMode {
  Manual = 1,
  Due,
  Priority,
  Title,
}

/**
 * Whether a date value is a date, a floating time, a UTC time or a time in a named zone. The four
 * kinds are kept apart because "today" and "overdue" depend on which one a task has.
 *
 * Identical to `IcalDateKind` in `@spy4x/time/ical`, which is merged in ts-libs but not released.
 * When it is, this file re-exports it and the copy goes.
 */
export enum IcalDateKind {
  /** `VALUE=DATE`: a calendar date with no time. */
  Date = 1,
  /** A local time with no zone: the same wall clock wherever the reader is. */
  Floating,
  /** A UTC time, written with a trailing `Z`. */
  Utc,
  /** A local time in the zone named by the `TZID` parameter. */
  Zoned,
}

/**
 * A DATE or DATE-TIME value in a form that keeps its kind through a round trip. Identical to
 * `IcalDateValue` in `@spy4x/time/ical`; becomes a re-export once that is released.
 */
export interface IcalDateValue {
  kind: IcalDateKind
  /** `YYYY-MM-DD`. */
  date: string
  /** `HH:MM:SS`; absent for {@link IcalDateKind.Date}. */
  time?: string
  /** The `TZID` parameter; only for {@link IcalDateKind.Zoned}. */
  tzid?: string
}

/** A due or start value. */
export type TaskDate = IcalDateValue

/** A reminder the task carries. Read-only in v1. */
export interface TaskReminder {
  /** The `VALARM` trigger as written, e.g. `-PT15M`. */
  trigger: string
}

/** One task as a screen shows it. */
export interface Task {
  /** The task's `UID`. */
  uid: string
  /** Where the task lives on the CalDAV server. */
  href: string
  /** The version the browser holds, sent back as `If-Match` on a save. */
  etag: string
  /** The raw iCalendar text this task was read from, so an edit can patch it. */
  ics: string
  /** The `href` of the list (calendar) the task belongs to. */
  listHref: string
  title: string
  notes: string
  status: TaskStatus
  /** The iCalendar `PRIORITY`, 0 to 9. */
  priority: number
  due?: TaskDate
  start?: TaskDate
  /** The `CATEGORIES` values. */
  tags: string[]
  /** The `UID` of the parent task, from `RELATED-TO`. */
  parentUid?: string
  /** `X-APPLE-SORT-ORDER`, the manual position inside a list. */
  sortOrder?: number
  /** The `RRULE` as written; present when the task repeats. */
  repeatRule?: string
  reminders: TaskReminder[]
}

/** A task with its subtasks, for the tree a list shows. */
export interface TaskNode {
  task: Task
  children: TaskNode[]
}

/** A task list: a CalDAV calendar that holds tasks. */
export interface TaskList {
  /** Where the list lives on the CalDAV server. */
  href: string
  name: string
  /** A CSS colour, when the server has one. */
  color?: string
  /** How many tasks are not completed. */
  openCount: number
}
