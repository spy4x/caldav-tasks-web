/**
 * Applies an editor change to a task as a lossless patch of its original iCalendar text. Only the
 * changed properties are rewritten; `@spy4x/time`'s `patchTodo` also stamps `DTSTAMP` and
 * `LAST-MODIFIED`, raises `SEQUENCE` only when dates, the repeat rule or the status change, and
 * writes every other line back byte for byte, so reminders
 * and `X-` properties that Tasks.org or another client wrote survive. Nothing here reads the clock
 * or the network.
 */

import { parseIcal, serializeIcal } from "@spy4x/time/ical"
import { patchTodo, type TodoPatch } from "@spy4x/time/ical-tasks"
import { parseTask } from "./model.ts"
import type { Task, TaskDate } from "./types.ts"

/** The task fields the editor changes. */
export enum EditField {
  Title = 1,
  Notes,
  Due,
  Start,
  Priority,
  Tags,
  List,
  SortOrder,
}

/**
 * What the editor changed. A field left out stays as it is; `null` clears `due`, `start` and
 * `sortOrder`.
 */
export interface TaskEdit {
  title?: string
  notes?: string
  due?: TaskDate | null
  start?: TaskDate | null
  /** The iCalendar `PRIORITY`, 0 to 9. */
  priority?: number
  tags?: string[]
  /**
   * The `href` of another list. The task moves there: see {@link EditOutput.moveToList}. Its
   * subtasks stay in the old list (a v1 decision), so a parent's move does not move them.
   */
  listHref?: string
  sortOrder?: number | null
}

/** The result of {@link editTask}. */
export type EditResult =
  | { success: true; output: EditOutput; error: null }
  | { success: false; output: null; error: string }

export interface EditOutput {
  /** The task as it reads after the edit. `etag` is still the old one: the save returns a new one. */
  task: Task
  /** The patched text to send. */
  ics: string
  /**
   * Set when the edit moves the task to another list. The caller creates the resource at
   * `moveToHref` with `ics` and deletes the old one only after the new one exists, so a failed
   * move never loses the task. A CalDAV resource cannot change calendar in place.
   */
  moveToList?: string
  /** Where the moved resource goes: the target list plus the old file name. */
  moveToHref?: string
}

/**
 * Patches `task.ics` with `edit`. A refusal (a zoned date with no `VTIMEZONE`, a bad priority) is a
 * failure with a message and leaves the task as it was.
 */
export function editTask(task: Task, edit: TaskEdit, now: Date): EditResult {
  const parsed = parseIcal(task.ics)
  if (!parsed.success) return { success: false, output: null, error: parsed.error.message }
  const patched = patchTodo(parsed.output, toPatch(edit), { now })
  if (!patched.success) return { success: false, output: null, error: patched.error.message }
  const ics = serializeIcal(parsed.output)
  // The list is where the task lives, not a property of the text, so it is carried over as given.
  const listHref = edit.listHref ?? task.listHref
  const moved = listHref !== task.listHref
  const href = moved
    ? `${listHref.endsWith(`/`) ? listHref : `${listHref}/`}${task.href.split(`/`).pop()}`
    : task.href
  const read = parseTask({ href, etag: task.etag, listHref, ics })
  if (!read.success) return { success: false, output: null, error: read.error }
  const output: EditOutput = { task: read.output, ics }
  if (moved) {
    output.moveToList = listHref
    output.moveToHref = href
  }
  return { success: true, output, error: null }
}

function toPatch(edit: TaskEdit): TodoPatch {
  const patch: TodoPatch = {}
  if (edit.title !== undefined) patch.summary = edit.title
  // Empty notes remove the line; an empty `DESCRIPTION:` would be left otherwise.
  if (edit.notes !== undefined) patch.description = edit.notes === `` ? null : edit.notes
  if (edit.due !== undefined) patch.due = edit.due
  if (edit.start !== undefined) patch.start = edit.start
  if (edit.priority !== undefined) patch.priority = edit.priority
  if (edit.tags !== undefined) patch.categories = edit.tags.length ? edit.tags : null
  if (edit.sortOrder !== undefined) patch.sortOrder = edit.sortOrder
  return patch
}
