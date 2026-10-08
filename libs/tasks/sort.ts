/**
 * The orders a list can show its tasks in. The comparing is `@spy4x/platform/universal/sort`'s
 * job; this file chooses the columns for each order and the value each task has in them.
 */

import { sortRows, type SortRule } from "@spy4x/platform/universal/sort"
import { dateInstant, priorityBand } from "./model.ts"
import { PriorityBand, SortMode, type Task } from "./types.ts"

interface Row {
  task: Task
  sortOrder: number | undefined
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

const asc = (key: Key): SortRule<Key> => ({ key, direction: `asc` })

/**
 * Each order falls back to the ones after it, so two tasks that tie always land in the same place.
 * A task with no value in a column (no due date, no priority, no manual position) comes after
 * those that have one. Tasks that tie on every column keep the order they came in.
 */
const RULES: Record<SortMode, SortRule<Key>[]> = {
  [SortMode.Manual]: [asc(`sortOrder`), asc(`due`), asc(`band`), asc(`title`)],
  [SortMode.Due]: [asc(`due`), asc(`band`), asc(`title`)],
  [SortMode.Priority]: [asc(`band`), asc(`due`), asc(`title`)],
  [SortMode.Title]: [asc(`title`), asc(`due`)],
}

/**
 * The tasks in the order `mode` names, as a viewer in `zone` sees them. Does not change `tasks`.
 *
 * - Manual: `X-APPLE-SORT-ORDER` ascending, as Tasks.org shows it, then due, then priority.
 * - Due: earliest first.
 * - Priority: high (1 to 4), medium (5), low (6 to 9), none.
 * - Title: case-insensitive, with `item 2` before `item 10`.
 */
export function sortTasks(tasks: readonly Task[], mode: SortMode, zone: string): Task[] {
  const rows: Row[] = tasks.map((task) => ({
    task,
    sortOrder: task.sortOrder,
    due: task.due ? dateInstant(task.due, zone).getTime() : undefined,
    band: BAND_RANK[priorityBand(task.priority)],
    title: task.title,
  }))
  return sortRows(rows, RULES[mode]).map((row) => row.task)
}
