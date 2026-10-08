/**
 * Search over title, notes and tags, for the local cache. Case and accents do not matter:
 * `cafe` finds `Café`, and `dong` finds `Đồng`.
 */

import type { Task } from "./types.ts"

// Letters that do not split into a base letter and an accent.
const FOLD: Record<string, string> = { đ: `d`, ł: `l`, ø: `o` }

/** Lower-cases `text` and removes its accents. */
export function foldText(text: string): string {
  return text.normalize(`NFD`).replace(/\p{M}/gu, ``).toLowerCase().replace(
    /[đłø]/g,
    (letter) => FOLD[letter],
  )
}

/**
 * The tasks that match `query`, in their input order. Every word of the query must appear in the
 * title, the notes or a tag. A blank query matches nothing.
 */
export function searchTasks(tasks: readonly Task[], query: string): Task[] {
  const words = foldText(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  return tasks.filter((task) => {
    const haystack = foldText([task.title, task.notes, ...task.tags].join(`\n`))
    return words.every((word) => haystack.includes(word))
  })
}
