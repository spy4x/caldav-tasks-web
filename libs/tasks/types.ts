/**
 * The task types screens and logic share. They describe what a screen shows; reading a task out of
 * iCalendar text and writing it back is the job of `@spy4x/time/ical`, and the text itself travels
 * with the task so an edit can patch it without losing what this file does not model.
 */

import type { IcalDateValue } from "@spy4x/time/ical"
import type { AlarmTrigger } from "@spy4x/time/ical-tasks"

export { IcalDateKind, type IcalDateValue } from "@spy4x/time/ical"

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

/** A due or start value. */
export type TaskDate = IcalDateValue

/** A reminder the task carries. Read-only in v1. */
export interface TaskReminder {
  /** The `VALARM` trigger as written, e.g. `-PT15M`: what to show when `alarm` cannot be described. */
  trigger: string
  /**
   * The trigger with what it is counted from (`RELATED=START` or `END`), so "before due" and
   * "before start" stay apart. Feed it to `describeAlarmTrigger`.
   */
  alarm: AlarmTrigger
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
  /**
   * When the task was created: `CREATED`, or `DTSTAMP` when the task has no `CREATED`. Tasks.org
   * places a task that was never dragged at this time in manual order.
   */
  created?: TaskDate
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
