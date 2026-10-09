import { useEffect, useMemo } from "preact/hooks"
import { PATHS } from "@ui/frame.tsx"
import { completeFocusedRow, editFocusedRow, moveRowFocus } from "@ui/task-focus.tsx"
import { createShortcutMatcher, ShortcutId, shortcutsOpen } from "../shortcuts.ts"

const QUICK_ADD = `[data-e2e="quick-add-input"]`
const SEARCH = `[data-e2e="search-input"]`

/**
 * Focuses the first element a selector finds, waiting for the page to draw it. It stops at the
 * first hit, so it never takes the focus back from where the person has moved on.
 */
function focusSoon(selector: string, tries = 10): void {
  const field = document.querySelector<HTMLElement>(selector)
  if (field) field.focus()
  else if (tries > 0) setTimeout(() => focusSoon(selector, tries - 1), 30)
}

/**
 * Page-wide keyboard shortcuts for the signed-in app: `n` new task, `/` search, `g t`, `g u` and
 * `g l` to go to Today, Upcoming and Lists, `j` and `k` to move through task rows, `x` to complete
 * and `e` or Enter to edit the focused row, `?` for the list. See `shortcuts.ts` for the table.
 *
 * @param navigate Moves the router to an address.
 */
export function useShortcuts(navigate: (to: string) => void): void {
  const match = useMemo(() => createShortcutMatcher(), [])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      const id = match({
        key: event.key,
        code: event.code,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        getModifierState: event.getModifierState?.bind(event),
        target: event.target as Element | null,
        timeStamp: event.timeStamp,
        isComposing: event.isComposing,
      })
      if (id === undefined) return
      const target = event.target as Element | null
      // Enter already presses a focused button; it only needs help on a row's check.
      if (event.key === `Enter` && !target?.matches?.(`input[data-task-check]`)) return
      event.preventDefault()
      switch (id) {
        case ShortcutId.NewTask:
          if (document.querySelector(QUICK_ADD)) focusSoon(QUICK_ADD)
          else {
            navigate(PATHS.today)
            focusSoon(QUICK_ADD)
          }
          break
        case ShortcutId.Search:
          navigate(PATHS.search)
          focusSoon(SEARCH)
          break
        case ShortcutId.GoToday:
          navigate(PATHS.today)
          break
        case ShortcutId.GoUpcoming:
          navigate(PATHS.upcoming)
          break
        case ShortcutId.GoLists:
          navigate(PATHS.lists)
          break
        case ShortcutId.NextTask:
          moveRowFocus(document, 1)
          break
        case ShortcutId.PreviousTask:
          moveRowFocus(document, -1)
          break
        case ShortcutId.CompleteTask:
          completeFocusedRow(document)
          break
        case ShortcutId.EditTask:
          editFocusedRow(document)
          break
        case ShortcutId.Help:
          shortcutsOpen.value = !shortcutsOpen.value
          break
      }
    }
    document.addEventListener(`keydown`, onKeyDown)
    return () => document.removeEventListener(`keydown`, onKeyDown)
  }, [match, navigate])
}
