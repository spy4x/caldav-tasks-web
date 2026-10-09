/**
 * Saving a task that changed on the server since it was loaded (a 412 on `If-Match`). The edit is
 * re-applied to the fresh copy when it touches different fields than the other change did. When
 * both changed the same field to different values, the colliding fields are reported so the screen
 * can ask "Keep mine / Use theirs".
 *
 * "Keep mine" is `editTask(theirs, edit, now)`; "Use theirs" drops the edit. Both are the caller's.
 */

import { EditField, type EditOutput, editTask, type TaskEdit } from "./edit.ts"
import type { Task } from "./types.ts"

export enum RebaseKind {
  /** The edit was applied to the fresh copy. */
  Applied = 1,
  /** Both sides changed the same field to different values. */
  Collision,
}

export type RebaseResult =
  | { success: true; output: { kind: RebaseKind.Applied } & EditOutput; error: null }
  | { success: true; output: { kind: RebaseKind.Collision; fields: EditField[] }; error: null }
  | { success: false; output: null; error: string }

/**
 * Re-applies `edit`, made on `base`, to `theirs`, the fresh copy from the server. A field counts as
 * touched by the edit when its value differs from `base`, and as touched by the server when
 * `theirs` differs from `base`; if both ended up at the same value there is no collision.
 */
export function rebaseEdit(base: Task, edit: TaskEdit, theirs: Task, now: Date): RebaseResult {
  const fields = collisions(base, edit, theirs)
  if (fields.length) {
    return { success: true, output: { kind: RebaseKind.Collision, fields }, error: null }
  }
  const applied = editTask(theirs, changesOf(base, edit), now)
  if (!applied.success) return applied
  return { success: true, output: { kind: RebaseKind.Applied, ...applied.output }, error: null }
}

/**
 * The part of `edit` that differs from `base`. A field the editor sent back as it was must not
 * overwrite what the server holds now.
 */
function changesOf(base: Task, edit: TaskEdit): TaskEdit {
  const changes: Record<string, unknown> = {}
  for (const { key, read } of FIELDS) {
    if (edit[key] !== undefined && !same(read(base), edit[key])) changes[key] = edit[key]
  }
  return changes as TaskEdit
}

/** The fields both sides changed, to different values. */
export function collisions(base: Task, edit: TaskEdit, theirs: Task): EditField[] {
  const out: EditField[] = []
  for (const { field, key, read } of FIELDS) {
    const mine = edit[key]
    if (mine === undefined) continue
    const original = read(base)
    const remote = read(theirs)
    if (!same(original, mine) && !same(original, remote) && !same(remote, mine)) out.push(field)
  }
  return out
}

const FIELDS: { field: EditField; key: keyof TaskEdit; read: (task: Task) => unknown }[] = [
  { field: EditField.Title, key: `title`, read: (t) => t.title },
  { field: EditField.Notes, key: `notes`, read: (t) => t.notes },
  { field: EditField.Due, key: `due`, read: (t) => t.due },
  { field: EditField.Start, key: `start`, read: (t) => t.start },
  { field: EditField.Priority, key: `priority`, read: (t) => t.priority },
  { field: EditField.Tags, key: `tags`, read: (t) => t.tags },
  { field: EditField.List, key: `listHref`, read: (t) => t.listHref },
  { field: EditField.SortOrder, key: `sortOrder`, read: (t) => t.sortOrder },
]

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}
