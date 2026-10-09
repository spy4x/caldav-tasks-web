import { reorderTask } from "@spy4x/platform/universal/ical-tasks-view"
import type { TaskEdit } from "@spy4x/time/ical-tasks-edit"
import type { Task } from "@spy4x/time/ical-tasks-model"

/** One task to write after a drag, with the edit that sets its manual position. */
export interface ReorderWrite {
  task: Task
  edit: TaskEdit
}

/**
 * The writes a drag needs. `siblings` are the tasks that share a parent, in the order shown, and
 * the task `uid` moves to `toIndex` among the others. The position maths is `reorderTask` in
 * `@spy4x/platform`; this only pairs each new `X-APPLE-SORT-ORDER` with the task it belongs to, so
 * the caller writes the moved task alone unless the library had to spread the values out.
 */
export function reorderWrites(
  siblings: readonly Task[],
  uid: string,
  toIndex: number,
  zone: string,
): ReorderWrite[] {
  const byUid = new Map(siblings.map((task) => [task.uid, task]))
  return reorderTask(siblings, uid, toIndex, zone).flatMap(({ uid, sortOrder }) => {
    const task = byUid.get(uid)
    return task ? [{ task, edit: { sortOrder } }] : []
  })
}
