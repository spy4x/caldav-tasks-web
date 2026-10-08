/**
 * The orders a list can show its tasks in. The comparing is `@spy4x/platform/universal/sort`'s
 * job; this file chooses the columns for each order and the value each task has in them.
 */

import { sortRows, type SortRule } from "@spy4x/platform/universal/sort"
import { IcalDateKind } from "@spy4x/time/ical"
import { dateInstant, priorityBand } from "./model.ts"
import { PriorityBand, SortMode, type Task, type TaskDate } from "./types.ts"

/** Tasks.org counts seconds from 2001-01-01; Unix time counts from 1970. This is the gap in ms. */
const APPLE_EPOCH_MS = 978_307_200_000

interface Row {
  task: Task
  /** The manual position: `X-APPLE-SORT-ORDER`, or the creation time in Apple seconds. */
  position: number | undefined
  due: number | undefined
  /** 1 for high to 3 for low; absent for a task with no priority, which sorts last. */
  band: number | undefined
  title: string
}

type Key = Exclude<keyof Row, "task">

const BAND_RANK: Record<PriorityBand, number | undefined> = {
  [PriorityBand.High]: 1,
  [PriorityBand.Medium]: 2,
  [PriorityBand.Low]: 3,
  [PriorityBand.None]: undefined,
}

/**
 * When a due value sorts. A date sorts at 23:59 of its day, after the timed dues of that day, as
 * Tasks.org sorts it. This is for ordering only: a date is still due the whole day.
 */
function dueSortInstant(due: TaskDate, zone: string): number {
  if (due.kind !== IcalDateKind.Date) return dateInstant(due, zone).getTime()
  return dateInstant({ ...due, kind: IcalDateKind.Floating, time: `23:59:00` }, zone).getTime()
}

/**
 * Where a task sits in manual order. A task that was never dragged has no `X-APPLE-SORT-ORDER`;
 * Tasks.org then uses its creation time in seconds since 2001-01-01, so it falls among the dragged
 * tasks by age.
 */
function manualPosition(task: Task, zone: string): number | undefined {
  if (task.sortOrder !== undefined) return task.sortOrder
  if (!task.created) return undefined
  return (dateInstant(task.created, zone).getTime() - APPLE_EPOCH_MS) / 1000
}

const asc = (key: Key): SortRule<Key> => ({ key, direction: `asc` })

/**
 * Each order falls back to the ones after it, so two tasks that tie always land in the same place.
 * A task with no value in a column (no due date, no priority, no manual position) comes after
 * those that have one. Tasks that tie on every column keep the order they came in.
 */
const RULES: Record<SortMode, SortRule<Key>[]> = {
  [SortMode.Manual]: [asc(`position`), asc(`title`)],
  [SortMode.Due]: [asc(`due`), asc(`band`), asc(`title`)],
  [SortMode.Priority]: [asc(`band`), asc(`title`)],
  [SortMode.Title]: [asc(`title`), asc(`due`)],
}

/**
 * The tasks in the order `mode` names, as a viewer in `zone` sees them. Does not change `tasks`.
 *
 * - Manual: `X-APPLE-SORT-ORDER` ascending, as Tasks.org shows it; a task without one counts as
 *   created-at, and ties go by title.
 * - Due: earliest first.
 * - Priority: high (1 to 4), medium (5), low (6 to 9), none; ties go by title.
 * - Title: case-insensitive, with `item 2` before `item 10`.
 */
export function sortTasks(tasks: readonly Task[], mode: SortMode, zone: string): Task[] {
  const rows: Row[] = tasks.map((task) => ({
    task,
    position: manualPosition(task, zone),
    due: task.due ? dueSortInstant(task.due, zone) : undefined,
    band: BAND_RANK[priorityBand(task.priority)],
    title: task.title,
  }))
  return sortRows(rows, RULES[mode]).map((row) => row.task)
}
