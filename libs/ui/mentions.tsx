import type { JSX } from "preact"
import { useRef, useState } from "preact/hooks"

/** A list a task can mention as `@Name`: its name, its page and its colour. */
export interface MentionList {
  name: string
  href: string
  color?: string
}

/**
 * The `@` mention being typed at `caret`: where its `@` is and the text after it. An `@` counts at
 * the start or after a space, so `a@b.com` is no mention. A list's name can hold spaces, so the
 * query runs to the caret, but not over a line break or another `@`.
 */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const start = before.lastIndexOf(`@`)
  if (start === -1 || (start > 0 && !/\s/.test(before[start - 1]))) return null
  const query = before.slice(start + 1)
  return /[\n@]/.test(query) ? null : { start, query }
}

/** `text` with the mention typed from `start` to `caret` replaced by `@name ` and the new caret. */
export function insertMention(
  text: string,
  start: number,
  caret: number,
  name: string,
): { text: string; caret: number } {
  const rest = text.slice(caret).replace(/^\s+/, ``)
  const head = `${text.slice(0, start)}@${name} `
  return { text: head + rest, caret: head.length }
}

/** One mention in a text: where its `@` starts, where it ends, and the list. */
interface Found<T> {
  start: number
  end: number
  list: T
}

/**
 * Every mention in a text, in order. A mention is `@` and a list's name, any case, at the start or
 * after a space and followed by the end, a space or punctuation. Where names overlap, the longest
 * wins: `@Ceramic Courses` mentions "Ceramic Courses", not "Ceramic".
 */
function findMentions<T extends { name: string }>(text: string, lists: readonly T[]): Found<T>[] {
  const lower = text.toLowerCase()
  const longestFirst = [...lists].sort((a, b) => b.name.length - a.name.length)
  const found: Found<T>[] = []
  for (let at = lower.indexOf(`@`); at !== -1; at = lower.indexOf(`@`, at + 1)) {
    if (at > 0 && !/\s/.test(lower[at - 1])) continue
    const list = longestFirst.find((each) => {
      const name = each.name.toLowerCase()
      return name !== `` && lower.startsWith(name, at + 1) &&
        /^($|[\s.,;:!?)])/.test(lower.slice(at + 1 + name.length))
    })
    if (list) found.push({ start: at, end: at + 1 + list.name.length, list })
  }
  return found
}

/** The lists a text mentions (see {@link findMentions}), each once, in the order of `lists`. */
export function mentionedLists<T extends MentionList>(text: string, lists: readonly T[]): T[] {
  const mentioned = new Set(findMentions(text, lists).map((found) => found.list))
  return lists.filter((list) => mentioned.has(list))
}

/**
 * `text` with each mention of the list named `from` renamed to `to`. `names` are all the lists'
 * names, `from` among them, so a longer name that starts with `from` is left alone.
 */
export function renameMentions(
  text: string,
  from: string,
  to: string,
  names: readonly string[],
): string {
  const lists = [...new Set([...names, from])].map((name) => ({ name }))
  return findMentions(text, lists).filter((found) => found.list.name === from).reverse()
    .reduce((rest, found) => `${rest.slice(0, found.start)}@${to}${rest.slice(found.end)}`, text)
}

/** `text` with its mentions of `lists` taken out, for a title whose mentions show as links. */
export function withoutMentions(text: string, lists: readonly MentionList[]): string {
  return findMentions(text, lists).reverse()
    .reduce((rest, found) => rest.slice(0, found.start) + rest.slice(found.end), text)
    .replace(/\s{2,}/g, ` `).trim()
}

type Field = HTMLInputElement | HTMLTextAreaElement

/**
 * The menu of lists that `@` opens in a text field. Call `track` from the field's `onInput` (and
 * `onClick`, as the caret moves), `onKeyDown` first in its key handler (it answers `true` when it
 * took the key), and `close` on blur; draw `menu` in a `relative` box around the field. Picking a
 * list writes `@Name ` into the field and fires its `input` event, so a field the page keeps in
 * its state gets the new text.
 */
export function useMentions(lists: readonly MentionList[], id: string) {
  const [at, setAt] = useState<{ start: number; query: string; field: Field } | null>(null)
  const [active, setActive] = useState(0)
  const picked = useRef(false)
  const query = at?.query.toLowerCase() ?? ``
  const matches = at === null ? [] : lists
    .filter((list) => list.name.toLowerCase().includes(query))
    .sort((a, b) =>
      Number(!a.name.toLowerCase().startsWith(query)) -
      Number(!b.name.toLowerCase().startsWith(query))
    )
    .slice(0, 8)
  const open = matches.length > 0
  const current = Math.min(active, matches.length - 1)

  const track = (field: Field) => {
    // The input event a pick fires is no typing: the menu stays shut.
    if (picked.current) return void (picked.current = false)
    const found = mentionQuery(field.value, field.selectionStart ?? field.value.length)
    setAt(found ? { ...found, field } : null)
    setActive(0)
  }
  const pick = (list: MentionList) => {
    if (!at) return
    const { field } = at
    const next = insertMention(field.value, at.start, field.selectionStart ?? at.start, list.name)
    field.value = next.text
    field.setSelectionRange(next.caret, next.caret)
    setAt(null)
    picked.current = true
    const view = field.ownerDocument.defaultView as unknown as typeof globalThis
    field.dispatchEvent(new view.Event(`input`, { bubbles: true }))
    picked.current = false
  }
  const onKeyDown = (event: KeyboardEvent): boolean => {
    if (!open) return false
    if (event.key === `ArrowDown` || event.key === `ArrowUp`) {
      const step = event.key === `ArrowDown` ? 1 : -1
      setActive((current + step + matches.length) % matches.length)
    } else if (event.key === `Enter` || event.key === `Tab`) {
      pick(matches[current])
    } else if (event.key === `Escape`) {
      setAt(null)
    } else {
      return false
    }
    event.preventDefault()
    event.stopPropagation()
    return true
  }

  const menu: JSX.Element | null = open
    ? (
      <ul
        id={id}
        role="listbox"
        aria-label="Mention a list"
        class="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-lg border border-subtle bg-surface p-1 text-sm text-foreground shadow-lg"
        data-e2e="mention-menu"
      >
        {matches.map((list, index) => (
          <li
            key={list.href}
            id={`${id}-${index}`}
            role="option"
            aria-selected={index === current}
            class={`flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 ${
              index === current ? `bg-selected-soft text-accent-text` : `hover:bg-hover`
            }`}
            // Keeps the focus in the field, so the menu does not close before the pick.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pick(list)}
          >
            <span
              class="size-2 shrink-0 rounded-full bg-accent"
              style={list.color ? { background: list.color } : undefined}
              aria-hidden="true"
            />
            <span class="truncate">{list.name}</span>
          </li>
        ))}
      </ul>
    )
    : null

  return {
    open,
    track,
    onKeyDown,
    close: () => setAt(null),
    menu,
    /** For the field: it controls the menu while it is open. */
    comboProps: {
      role: `combobox` as const,
      "aria-expanded": open,
      "aria-controls": id,
      "aria-autocomplete": `list` as const,
      "aria-activedescendant": open ? `${id}-${current}` : undefined,
    },
  }
}
