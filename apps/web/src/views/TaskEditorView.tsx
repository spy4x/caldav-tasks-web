import { useSignal } from "@preact/signals"
import { useLocation, useParams } from "wouter-preact"
import { LoadingBody } from "@ui/task-screen.tsx"
import { type TaskDraft, type TaskEditorErrors, TaskEditorScreen } from "@ui/task-editor-screen.tsx"
import { calendarsLoaded } from "../state/calendars.ts"
import { allTags, taskLists } from "../state/task-lists.ts"
import {
  keepMineAfterConflict,
  saveTask,
  type TaskConflict,
  tasks,
  WriteKind,
} from "../state/tasks.ts"
import type { WriteResult } from "../state/tasks.ts"
import { addTask } from "../state/task-writes.ts"
import { toasts } from "../state/toasts.ts"
import { listPath, taskPath } from "../routes.ts"
import { browserZone } from "./clock.ts"
import { NotFoundView } from "./NotFoundView.tsx"
import { deleteWithUndo } from "./task-actions.ts"
import { draftToEdit } from "./task-edit.ts"

/**
 * The task editor, wired. A save that meets an edit made elsewhere opens the conflict dialog;
 * "Keep mine" writes the form as it stands then, not the one that collided.
 */
export function TaskEditorView() {
  const { uid = `` } = useParams<{ uid: string }>()
  const [, navigate] = useLocation()
  const saving = useSignal(false)
  const deleting = useSignal(false)
  const errors = useSignal<TaskEditorErrors>({})
  const conflict = useSignal<TaskConflict | null>(null)
  const task = tasks.value.find((candidate) => candidate.uid === uid)
  if (!task) return calendarsLoaded.value ? <NotFoundView /> : <LoadingBody label="Loading task" />
  const backHref = listPath(task.listHref)

  /** Shows the outcome of a save; resolves `true` when it went through. */
  function settle(result: WriteResult): boolean {
    switch (result.kind) {
      case WriteKind.Saved:
        conflict.value = null
        errors.value = {}
        return true
      case WriteKind.Conflict:
        conflict.value = result.conflict
        return false
      case WriteKind.Failed:
        errors.value = { form: result.message }
        return false
    }
  }

  async function run(write: () => Promise<WriteResult>): Promise<void> {
    saving.value = true
    errors.value = {}
    try {
      if (settle(await write())) {
        toasts.success({ title: ``, body: `Saved` })
        navigate(backHref)
      }
    } finally {
      saving.value = false
    }
  }

  return (
    <TaskEditorScreen
      task={task}
      lists={taskLists.value}
      tagSuggestions={allTags.value}
      subtasks={tasks.value.filter((candidate) => candidate.parentUid === task.uid)}
      subtaskHref={taskPath}
      onSave={(draft) => void run(() => saveTask(task, draftToEdit(task, draft)))}
      saving={saving.value}
      errors={errors.value}
      conflict={conflict.value !== null}
      onKeepMine={(draft: TaskDraft) => {
        const collided = conflict.value
        if (!collided) return
        // The form may have changed since the collision, so the edit is made again from it.
        const edit = draftToEdit(collided.base, draft)
        void run(() => keepMineAfterConflict({ ...collided, edit }))
      }}
      // The cache already holds their copy and the form has reset to it.
      onUseTheirs={() => conflict.value = null}
      timeZone={browserZone()}
      onAddSubtask={(title) =>
        void addTask({ title }, { listHref: task.listHref, parent: task }).then((result) => {
          if (result.kind === WriteKind.Failed) toasts.error({ title: ``, body: result.message })
        })}
      onDelete={async () => {
        deleting.value = true
        try {
          if (await deleteWithUndo(task)) navigate(backHref)
        } finally {
          deleting.value = false
        }
      }}
      deleting={deleting.value}
      navigate={navigate}
      backHref={backHref}
    />
  )
}
