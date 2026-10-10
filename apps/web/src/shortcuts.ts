import { signal } from "@preact/signals"
import {
  createHotkeyMatcher,
  type HotkeyBinding,
  type HotkeySequenceEvent,
} from "@spy4x/platform/browser/hotkeys"
import type { Shortcut } from "@spy4x/preact-ui/shortcuts-dialog"

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
    description: `Edit the focused task (Enter works too)`,
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

/** Elements that count as a dialog: no shortcut fires inside one. */
const DIALOG = `dialog, [role='dialog'], [role='alertdialog']`

/** A key press as the matcher reads it. A `KeyboardEvent` is one. */
export type ShortcutPress = HotkeySequenceEvent

/**
 * The matcher for the table: call it with each key press and it returns the shortcut the press
 * completes, or `undefined`. It is `createHotkeyMatcher` over `SHORTCUTS`, with presses inside a
 * dialog ignored.
 */
export function createShortcutMatcher(): (press: ShortcutPress) => ShortcutId | undefined {
  const bindings: HotkeyBinding<ShortcutId>[] = SHORTCUTS.flatMap((def) =>
    def.keys.map((keys) => ({ id: def.id, keys }))
  )
  return createHotkeyMatcher(bindings, {
    timeoutMs: SEQUENCE_TIMEOUT_MS,
    ignore: (press) => (press.target as Element | null)?.closest?.(DIALOG) != null,
  })
}

/**
 * The table as `ShortcutsDialog` lists it: one row per shortcut, a sequence written with a space
 * (`"g t"`). Only the first way to trigger a shortcut is drawn, and a second way is named in the
 * description.
 */
export function listShortcuts(): Shortcut[] {
  return SHORTCUTS.map(({ description, group, keys }) => ({
    keys: keys[0].join(` `),
    description,
    group,
  }))
}
