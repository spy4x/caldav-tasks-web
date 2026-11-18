import type { TaskList } from "@spy4x/time/ical-tasks-model"
import { parseQuickAdd, type QuickAddResult } from "@spy4x/platform"
import { mentionedLists, type MentionList, withoutMentions } from "@ui/mentions.tsx"
import { listPath } from "../routes.ts"

/** The lists a task can mention as `@Name`, each with its page. */
export function mentionLists(lists: readonly TaskList[]): MentionList[] {
  return lists.map((list) => ({ name: list.name, href: listPath(list), color: list.color }))
}

/**
 * Reads a new task's text as the quick add does, except for mentions of `lists`: quick add takes
 * `@word` for a tag, so they are kept out of its reading and put back at the title's end.
 */
export function parseKeepingMentions(
  text: string,
  lists: readonly MentionList[],
  options: { now: Date; timeZone: string },
): QuickAddResult {
  const kept = mentionedLists(text, lists)
  const parsed = parseQuickAdd(withoutMentions(text, kept), options)
  if (kept.length === 0) return parsed
  const title = [parsed.title, ...kept.map((list) => `@${list.name}`)].filter(Boolean).join(` `)
  return { ...parsed, title }
}
