import { signal } from "@preact/signals"
import {
  type Hotkey,
  type HotkeyEvent,
  isTypingTarget,
  matchesHotkey,
  parseHotkey,
  type TypingTarget,
} from "@spy4x/platform/browser/hotkeys"

/** What a shortcut does. */
export enum ShortcutId {
  NewTask = 1,
  Search,
  GoToday,
  GoUpcoming,
  GoLists,
  NextTask,
  PreviousTask,
  CompleteTask,
  EditTask,
  Help,
}

/** One row of the table: what it does, how it is listed, and the key presses that trigger it. */
export interface ShortcutDef {
  id: ShortcutId
  description: string
  group: string
  /**
   * Ways to trigger it. Each way is a sequence of one or two key presses, each written as
   * `parseHotkey` takes it (`["g", "t"]` is `g` then `t`).
   */
  keys: readonly (readonly string[])[]
}

/** How long a first key waits for the second, in milliseconds. */
export const SEQUENCE_TIMEOUT_MS = 1000

/** The one table of shortcuts. The matcher and the `?` dialog both read it. */
export const SHORTCUTS: readonly ShortcutDef[] = [
  { id: ShortcutId.NewTask, description: `New task`, group: `Tasks`, keys: [[`n`]] },
  { id: ShortcutId.NextTask, description: `Next task`, group: `Tasks`, keys: [[`j`]] },
  { id: ShortcutId.PreviousTask, description: `Previous task`, group: `Tasks`, keys: [[`k`]] },
  {
    id: ShortcutId.CompleteTask,
    description: `Complete the focused task`,
    group: `Tasks`,
    keys: [[`x`]],
  },
  {
    id: ShortcutId.EditTask,
    description: `Edit the focused task`,
    group: `Tasks`,
    keys: [[`e`], [`enter`]],
  },
  { id: ShortcutId.Search, description: `Search`, group: `Go to`, keys: [[`/`]] },
  { id: ShortcutId.GoToday, description: `Go to Today`, group: `Go to`, keys: [[`g`, `t`]] },
  { id: ShortcutId.GoUpcoming, description: `Go to Upcoming`, group: `Go to`, keys: [[`g`, `u`]] },
  { id: ShortcutId.GoLists, description: `Go to Lists`, group: `Go to`, keys: [[`g`, `l`]] },
  { id: ShortcutId.Help, description: `Show keyboard shortcuts`, group: `Help`, keys: [[`?`]] },
]

/** Whether the shortcuts dialog is open. The `?` key and the Settings button set it. */
export const shortcutsOpen = signal(false)

/** A key press as the matcher reads it. A `KeyboardEvent` is one. */
export interface ShortcutPress extends HotkeyEvent {
  target: (TypingTarget & { closest?(selector: string): unknown }) | null
  /** When it happened, in milliseconds. `KeyboardEvent.timeStamp` serves. */
  timeStamp: number
  isComposing?: boolean
}

interface Way {
  id: ShortcutId
  combos: Hotkey[]
}

interface Progress {
  way: Way
  /** How many presses of the sequence have matched. */
  matched: number
}

/** Elements that count as a dialog: no shortcut fires inside one. */
const DIALOG = `dialog, [role='dialog'], [role='alertdialog']`

/**
 * Builds the matcher for a table. Call the result with each key press: it returns the shortcut the
 * press completes, or `undefined`. It keeps the first key of a two-key sequence for `timeoutMs`;
 * any other key, or a late one, drops it.
 *
 * A press while typing (`isTypingTarget`), inside a dialog or while composing text never matches, and
 * it cancels a waiting first key. A key with Control, Alt or Meta held is not a match (`matchesHotkey`).
 *
 * @param table The shortcuts, in priority order.
 * @param options `timeoutMs` is the wait for a second key; `apple` says whether `mod` is Command.
 * @throws {Error} When a combination in the table cannot be read.
 */
export function createShortcutMatcher(
  table: readonly ShortcutDef[] = SHORTCUTS,
  { timeoutMs = SEQUENCE_TIMEOUT_MS, apple = false }: { timeoutMs?: number; apple?: boolean } = {},
): (press: ShortcutPress) => ShortcutId | undefined {
  const ways: Way[] = table.flatMap((def) =>
    def.keys.map((keys) => ({ id: def.id, combos: keys.map((combo) => parseHotkey(combo)) }))
  )
  let waiting: { progress: Progress[]; at: number } | null = null

  const step = (candidates: readonly Progress[], press: ShortcutPress): Progress[] =>
    candidates.filter(({ way, matched }) => matchesHotkey(way.combos[matched], press, apple))
      .map(({ way, matched }) => ({ way, matched: matched + 1 }))

  return (press) => {
    const blocked = press.isComposing === true || isTypingTarget(press.target) ||
      press.target?.closest?.(DIALOG) != null
    if (blocked) {
      waiting = null
      return undefined
    }
    const fresh = ways.map((way) => ({ way, matched: 0 }))
    const live = waiting && press.timeStamp - waiting.at <= timeoutMs ? waiting.progress : null
    waiting = null
    // A key that does not continue the waiting sequence starts over, so `g g t` still reaches `g t`.
    let advanced = live ? step(live, press) : []
    if (advanced.length === 0) advanced = step(fresh, press)
    const done = advanced.find(({ way, matched }) => matched === way.combos.length)
    if (done) return done.way.id
    if (advanced.length > 0) waiting = { progress: advanced, at: press.timeStamp }
    return undefined
  }
}

/** One row of the `?` dialog. */
export interface ShortcutListing {
  description: string
  group: string
  /** The ways to trigger it; each is the keys to press in order. */
  keys: readonly (readonly string[])[]
}

/** The table as the dialog lists it. */
export function listShortcuts(table: readonly ShortcutDef[] = SHORTCUTS): ShortcutListing[] {
  return table.map(({ description, group, keys }) => ({ description, group, keys }))
}
