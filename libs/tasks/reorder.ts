import { reorderTask, SortMode, sortTasks } from "@spy4x/platform/universal/ical-tasks-view"
import type { TaskEdit } from "@spy4x/time/ical-tasks-edit"
import type { Task } from "@spy4x/time/ical-tasks-model"

/** One task to write after a drag, with the edit that sets its manual position. */
export interface ReorderWrite {
  task: Task
  edit: TaskEdit
}

/**
 * The writes a drag needs. `visible` are the siblings the person sees (they share a parent), in
 * the order shown; the task `uid` is dropped at `toIndex` among the other visible ones. A filter or
 * hidden completed tasks mean the person cannot see every sibling, so the positions are computed
 * among all of them (`all` is every loaded task of the list): the hidden siblings stay fixed
 * points, and a respacing never steps over one. The drop is placed right after the visible task
 * it lands below, or right before the first visible task when it lands at the top.
 *
 * The position maths is `reorderTask` in `@spy4x/platform`. It writes the fewest tasks that keep
 * the order, which may be a neighbour of the moved task. Completed tasks that were never loaded
 * are unknown here.
 */
export function reorderWrites(
  all: readonly Task[],
  visible: readonly Task[],
  uid: string,
  toIndex: number,
  zone: string,
): ReorderWrite[] {
  const moved = visible.find((task) => task.uid === uid)
  if (!moved) return []
  const full = sortTasks(
    all.filter((task) => task.parentUid === moved.parentUid),
    SortMode.Manual,
    zone,
  )
  const rest = full.filter((task) => task.uid !== uid)
  const others = visible.filter((task) => task.uid !== uid)
  const at = Math.min(Math.max(toIndex, 0), others.length)
  const anchor = at === 0 ? others[0] : others[at - 1]
  const target = anchor === undefined
    ? full.findIndex((task) => task.uid === uid)
    : rest.findIndex((task) => task.uid === anchor.uid) + (at === 0 ? 0 : 1)
  const byUid = new Map(full.map((task) => [task.uid, task]))
  return reorderTask(full, uid, target, zone).flatMap(({ uid, sortOrder }) => {
    const task = byUid.get(uid)
    return task ? [{ task, edit: { sortOrder } }] : []
  })
}
