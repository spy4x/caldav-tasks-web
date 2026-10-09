import type { TaskEdit } from "@spy4x/time/ical-tasks-edit"
import type { AlarmInput } from "@spy4x/time/ical-tasks"
import type { Task, TaskDate, TaskReminder } from "@spy4x/time/ical-tasks-model"
import type { TaskDraft } from "@ui/task-editor-screen.tsx"

function sameDate(a: TaskDate | null | undefined, b: TaskDate | null | undefined): boolean {
  if (!a || !b) return !a && !b
  return a.kind === b.kind && a.date === b.date && a.time === b.time && a.tzid === b.tzid
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index])
}

/** Whether the form's reminders are the ones the task was read with, in the same order. */
function sameReminders(draft: readonly AlarmInput[], stored: readonly TaskReminder[]): boolean {
  return JSON.stringify(draft) === JSON.stringify(stored.map((item) => ({ trigger: item.alarm })))
}

/**
 * What the form changed against `task`. A field the person left alone is left out, so saving never
 * rewrites a value they did not touch: a floating time stays floating, a zoned one keeps its zone.
 */
export function draftToEdit(task: Task, draft: TaskDraft): TaskEdit {
  const edit: TaskEdit = {}
  if (draft.title !== task.title) edit.title = draft.title
  if (draft.notes !== task.notes) edit.notes = draft.notes
  if (!sameDate(draft.due, task.due)) edit.due = draft.due
  if (!sameDate(draft.start, task.start)) edit.start = draft.start
  if (draft.priority !== task.priority) edit.priority = draft.priority
  if (!sameList(draft.tags, task.tags)) edit.tags = draft.tags
  if (draft.listHref !== task.listHref) edit.listHref = draft.listHref
  if (draft.repeatRule !== (task.repeatRule ?? null)) edit.repeatRule = draft.repeatRule
  if (!sameReminders(draft.reminders, task.reminders)) edit.reminders = draft.reminders
  return edit
}
