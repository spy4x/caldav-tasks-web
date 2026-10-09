import { SortMode } from "@tasks/types.ts"

const SORT_WORDS: Record<SortMode, string> = {
  [SortMode.Manual]: ``,
  [SortMode.Due]: `due`,
  [SortMode.Priority]: `priority`,
  [SortMode.Title]: `title`,
}

/** The `sort` parameter for a mode; manual order is the default and has none. */
export function sortToParam(mode: SortMode): string {
  return SORT_WORDS[mode]
}

/** The mode a `sort` parameter names; anything unknown is manual order. */
export function sortFromParam(value: string): SortMode {
  for (const [mode, word] of Object.entries(SORT_WORDS)) {
    if (word !== `` && word === value) return Number(mode) as SortMode
  }
  return SortMode.Manual
}

/** The `tags` parameter for a set of tags: each escaped, joined with commas. */
export function tagsToParam(tags: readonly string[]): string {
  return tags.map(encodeURIComponent).join(`,`)
}

/** The tags a `tags` parameter names. */
export function tagsFromParam(value: string): string[] {
  return value ? value.split(`,`).map(unescapeTag) : []
}

function unescapeTag(tag: string): string {
  try {
    return decodeURIComponent(tag)
  } catch {
    return tag
  }
}
