import type { Task } from "@spy4x/time/ical-tasks-model"
import { toasts } from "../state/toasts.ts"
import { deleteTask, restoreTask } from "../state/task-writes.ts"
import { setTaskDone, undoWrite, WriteKind, type WriteResult } from "../state/tasks.ts"

const NO_HEADING = ``

/** Shows why a write did not go through. Resolves `true` when it was saved. */
function reportFailure(result: WriteResult): boolean {
  switch (result.kind) {
    case WriteKind.Saved:
      return true
    case WriteKind.Offline:
      toasts.error({ title: NO_HEADING, body: result.notice })
      return false
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
