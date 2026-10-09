import type { Task } from "@spy4x/time/ical-tasks-model"
import { toasts } from "../state/toasts.ts"
import { deleteTask, restoreTask } from "../state/task-writes.ts"
import { reorderWrites } from "@tasks/reorder.ts"
import { saveTask, setTaskDone, undoWrite, WriteKind, type WriteResult } from "../state/tasks.ts"

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
 * Deletes a task and offers Undo in a toast. Undo creates the task again from the text it had.
 * Resolves `true` when the task was deleted.
 */
export async function deleteWithUndo(task: Task): Promise<boolean> {
  const result = await deleteTask(task)
  if (!reportFailure(result)) return false
  toasts.success({
    title: NO_HEADING,
    body: `Deleted "${task.title}"`,
    action: { label: `Undo`, onAction: () => undo(() => restoreTask(task), `Restored`) },
  })
  return true
}

/**
 * Moves a task to `toIndex` among its `siblings` in manual order. Writes the moved task alone, or
 * the few siblings whose values `reorderTask` had to spread out, one after another. Failures show a
 * toast. Resolves `true` when every write was saved.
 */
export async function reorderInList(
  task: Task,
  siblings: readonly Task[],
  toIndex: number,
  zone: string,
): Promise<boolean> {
  for (const write of reorderWrites(siblings, task.uid, toIndex, zone)) {
    if (!reportFailure(await saveTask(write.task, write.edit))) return false
  }
  return true
}
