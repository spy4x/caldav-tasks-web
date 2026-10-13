import type { Task } from "@spy4x/time/ical-tasks-model"
import { toasts } from "../state/toasts.ts"
import { deleteTaskTree, restoreTask } from "../state/task-writes.ts"
import { reorderWrites } from "@tasks/reorder.ts"
import { findCalendar } from "../state/calendars.ts"
import { loadCompleted } from "../state/sync.ts"
import {
  saveTask,
  setTaskDone,
  tasks,
  undoWrite,
  WriteKind,
  type WriteResult,
} from "../state/tasks.ts"

const NO_HEADING = ``

/** Shows why a write did not go through. Resolves `true` when it was saved. */
function reportFailure(result: WriteResult): boolean {
  switch (result.kind) {
    case WriteKind.Saved:
      return true
    case WriteKind.Conflict:
      toasts.error({
        title: NO_HEADING,
        body: `The task changed elsewhere. Open it and try again.`,
      })
      return false
    case WriteKind.Failed:
      toasts.error({ title: NO_HEADING, body: result.message })
      return false
  }
}

/** Runs an undo and says how it went. */
async function undo(run: () => Promise<WriteResult>, done: string): Promise<void> {
  if (reportFailure(await run())) toasts.success({ title: NO_HEADING, body: done })
}

/**
 * Completes or reopens a task and offers Undo in a toast. Undo writes the text from before over
 * the saved copy, and says so when the task changed elsewhere in between instead of overwriting it.
 */
export async function completeWithUndo(task: Task, done: boolean): Promise<void> {
  const result = await setTaskDone(task, done)
  if (!reportFailure(result) || result.kind !== WriteKind.Saved) return
  const saved = result.task
  toasts.success({
    title: NO_HEADING,
    body: done ? `Completed "${task.title}"` : `Reopened "${task.title}"`,
    action: {
      label: `Undo`,
      onAction: () => undo(() => undoWrite(saved, task.ics), `Undone`),
    },
  })
}

/**
 * Loads the completed tasks of the list `task` is in, unless the device has them. A completed
 * subtask is a subtask: the delete question counts it and the delete takes it, so both need it in
 * the cache. Offline it stays unknown.
 */
export async function loadHiddenSubtasks(task: Task): Promise<void> {
  if (findCalendar(task.listHref)?.completedLoaded === false) await loadCompleted(task.listHref)
}

/** Puts deleted tasks back one after another, a task before its subtasks. Stops at a failure. */
async function restoreAll(deleted: readonly Task[]): Promise<WriteResult> {
  let result = await restoreTask(deleted[0])
  for (const task of deleted.slice(1)) {
    if (result.kind !== WriteKind.Saved) return result
    result = await restoreTask(task)
  }
  return result
}

/**
 * Deletes a task with every subtask under it and offers Undo in a toast. Undo creates them again
 * from the text they had. Resolves `true` when the task itself is gone, so the caller can leave its
 * page; a subtask the server refused to delete is named in a second toast.
 */
export async function deleteWithUndo(task: Task): Promise<boolean> {
  await loadHiddenSubtasks(task)
  const { result, deleted } = await deleteTaskTree(task)
  const whole = reportFailure(result)
  if (deleted.length === 0) return false
  const gone = deleted[0].uid === task.uid
  const under = deleted.length - 1
  toasts.success({
    title: NO_HEADING,
    body: !gone
      ? `Deleted ${deleted.length} of the subtasks of "${task.title}"`
      : under === 0
      ? `Deleted "${task.title}"`
      : `Deleted "${task.title}" and its ${under === 1 ? `subtask` : `${under} subtasks`}`,
    action: {
      label: `Undo`,
      onAction: () => undo(() => restoreAll(deleted), `Restored`),
    },
  })
  return whole || gone
}

/** The toast for a failed write during a drag: the order may be half changed, so say so. */
function reportReorderFailure(result: WriteResult): boolean {
  if (result.kind === WriteKind.Saved) return true
  toasts.error({
    title: NO_HEADING,
    body: result.kind === WriteKind.Conflict
      ? `Could not save the new order: a task changed elsewhere. Check the list and drag again.`
      : `Could not save the new order: ${result.message}`,
  })
  return false
}

/**
 * Moves a task to `toIndex` among the `visible` siblings in manual order, in the list `listHref`.
 * Every loaded task of the list counts, so hidden siblings keep their place; before the first drag
 * in a list, its completed tasks are loaded too, as "Show completed" loads them. Writes the fewest
 * tasks that keep the order (the moved one, a neighbour, or a few spread out), one after another.
 * Failures show a toast; a failure after the first write leaves the earlier ones saved. Resolves
 * `true` when every write was saved.
 */
export async function reorderInList(
  listHref: string,
  task: Task,
  visible: readonly Task[],
  toIndex: number,
  zone: string,
): Promise<boolean> {
  if (findCalendar(listHref)?.completedLoaded === false) await loadCompleted(listHref)
  const all = tasks.value.filter((each) => each.listHref === listHref)
  for (const write of reorderWrites(all, visible, task.uid, toIndex, zone)) {
    if (!reportReorderFailure(await saveTask(write.task, write.edit))) return false
  }
  return true
}
