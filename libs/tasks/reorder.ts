import {
  buildTree,
  reorderTask,
  SortMode,
  sortTasks,
} from "@spy4x/platform/universal/ical-tasks-view"
import type { TaskEdit } from "@spy4x/time/ical-tasks-edit"
import type { Task, TaskNode } from "@spy4x/time/ical-tasks-model"

/** One task to write after a drag, with the edit that sets its manual position. */
export interface ReorderWrite {
  task: Task
  edit: TaskEdit
}

/** Each task's group in the tree of every loaded task, by `UID`, and the top-level group. */
function groupsOf(all: readonly Task[], zone: string) {
  const groups = new Map<string, readonly Task[]>()
  const walk = (nodes: readonly TaskNode[]) => {
    const group = nodes.map((node) => node.task)
    for (const node of nodes) {
      if (!groups.has(node.task.uid)) groups.set(node.task.uid, group)
      walk(node.children)
    }
    return group
  }
  const top = walk(buildTree(all, zone))
  return { groups, top }
}

/**
 * The tasks a drag among `visible` is computed over: the visible ones and their hidden siblings.
 * The siblings are the group the tree of every loaded task puts them in, as `buildTree` decides,
 * so a subtask whose parent is not loaded is at the top level here as on screen. A tag filter that
 * hides a parent shows its subtask at the top level; when any visible task is top-level in the full
 * tree, the group is the top level, and the subtask's own hidden siblings do not count.
 */
function siblingsOf(
  all: readonly Task[],
  visible: readonly Task[],
  zone: string,
): Map<string, Task> {
  const { groups, top } = groupsOf(all, zone)
  const levels = new Set(visible.map((task) => groups.get(task.uid) ?? []))
  const hidden = levels.has(top) ? [top] : [...levels]
  const byUid = new Map<string, Task>()
  for (const task of [...hidden.flat(), ...visible]) byUid.set(task.uid, task)
  return byUid
}

/**
 * The writes a drag needs. `visible` are the siblings the person sees, in the order shown; the task
 * `uid` is dropped at `toIndex` among the other visible ones. A filter or hidden completed tasks
 * mean the person cannot see every sibling, so the positions are computed among the hidden ones
 * too (`all` is every loaded task of the list): they stay fixed points, and a respacing never steps
 * over one. The drop is placed right after the visible task it lands below, or right before the
 * first visible task when it lands at the top.
 *
 * The hidden tasks taken into account are those at the same level of the tree of every loaded
 * task (see {@link siblingsOf}), so the order stays right once the filter is cleared.
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
  if (!visible.some((task) => task.uid === uid)) return []
  const byUid = siblingsOf(all, visible, zone)
  const full = sortTasks([...byUid.values()], SortMode.Manual, zone)
  const rest = full.filter((task) => task.uid !== uid)
  const others = visible.filter((task) => task.uid !== uid)
  const at = Math.min(Math.max(toIndex, 0), others.length)
  const anchor = at === 0 ? others[0] : others[at - 1]
  const target = anchor === undefined
    ? full.findIndex((task) => task.uid === uid)
    : rest.findIndex((task) => task.uid === anchor.uid) + (at === 0 ? 0 : 1)
  return reorderTask(full, uid, target, zone).flatMap(({ uid, sortOrder }) => {
    const task = byUid.get(uid)
    return task ? [{ task, edit: { sortOrder } }] : []
  })
}
