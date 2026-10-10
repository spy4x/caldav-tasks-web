import { useEffect, useMemo } from "preact/hooks"
import { PATHS } from "@ui/frame.tsx"
import { completeFocusedRow, editFocusedRow, moveRowFocus } from "@ui/task-focus.tsx"
import { leaveGuard } from "../leave-guard.ts"
import { createShortcutMatcher, ShortcutId, shortcutsOpen } from "../shortcuts.ts"

const QUICK_ADD = `[data-e2e="quick-add-input"]`
const SEARCH = `[data-e2e="search-input"]`

/** Stops the watcher `focusWhenThere` left waiting, if there is one. */
let stopWaiting = () => {}

/**
 * Focuses the first element a selector finds, now if it is there, else the moment the page draws
 * it (a mutation observer runs before the next key press can arrive). One watcher waits at a time:
 * a newer shortcut replaces it. It stops once the field is there or after two seconds. It focuses
 * the field only while the focus is still where the key was pressed, or nowhere, so it never takes
 * the focus from where the person has moved on.
 */
function focusWhenThere(selector: string): void {
  stopWaiting()
  const now = document.querySelector<HTMLElement>(selector)
  if (now) return now.focus()
  const pressedOn = document.activeElement
  const watcher = new (document.defaultView?.MutationObserver ?? MutationObserver)(() => {
    const field = document.querySelector<HTMLElement>(selector)
    if (!field) return
    stopWaiting()
    const active = document.activeElement
    if (!active || active === document.body || active === pressedOn) field.focus()
  })
  const giveUp = setTimeout(() => stopWaiting(), 2000)
  stopWaiting = () => {
    watcher.disconnect()
    clearTimeout(giveUp)
    stopWaiting = () => {}
  }
  watcher.observe(document.body, { childList: true, subtree: true })
}

/**
 * Page-wide keyboard shortcuts for the signed-in app: `n` new task, `/` search, `g t`, `g u` and
 * `g l` to go to Today, Upcoming and Lists, `j` and `k` to move through task rows, `x` to complete
 * and `e` or Enter to edit the focused row, `?` for the list. See `shortcuts.ts` for the table.
 *
 * @param navigate Moves the router to an address. The shortcuts that leave the page go through the
 *   leave guard first, so the task editor asks before it drops unsaved changes.
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
          if (document.querySelector(QUICK_ADD)) focusWhenThere(QUICK_ADD)
          else {
            leaveGuard.navigate(() => {
              navigate(PATHS.today)
              focusWhenThere(QUICK_ADD)
            })
          }
          break
        case ShortcutId.Search:
          // On the search page the field is there: keep the query, only move the focus.
          if (document.querySelector(SEARCH)) focusWhenThere(SEARCH)
          else {
            leaveGuard.navigate(() => {
              navigate(PATHS.search)
              focusWhenThere(SEARCH)
            })
          }
          break
        case ShortcutId.GoToday:
          leaveGuard.navigate(() => navigate(PATHS.today))
          break
        case ShortcutId.GoUpcoming:
          leaveGuard.navigate(() => navigate(PATHS.upcoming))
          break
        case ShortcutId.GoLists:
          leaveGuard.navigate(() => navigate(PATHS.lists))
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
  useEffect(() => () => stopWaiting(), [])
}
