/**
 * Search over title, notes and tags, for the local cache. Case and accents do not matter:
 * `cafe` finds `Café`, and `dong` finds `Đồng`. The matching is `@spy4x/platform/universal/text`'s.
 */

import { filterRows, search } from "@spy4x/platform/universal/text"
import type { Task } from "./types.ts"

/**
 * The tasks that match `query`, in their input order. Every word of the query must appear in the
 * title, the notes or a tag. A blank query matches nothing.
 */
export function searchTasks(tasks: readonly Task[], query: string): Task[] {
  if (query.trim() === ``) return []
  return filterRows(
    [...tasks],
    query,
    (task, word) =>
      search(task.title, word) || search(task.notes, word) ||
      task.tags.some((tag) => search(tag, word)),
  )
}
