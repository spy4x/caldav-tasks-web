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

/** Where the "Keyboard shortcuts" switch is remembered. `localStorage` satisfies it. */
export interface ShortcutsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** The key the switch is stored under: `off` when it is off, `on` when it was turned back on. */
export const SHORTCUTS_STORAGE_KEY = `caldav-tasks-shortcuts`

/** The browser's `localStorage`, or nothing where it is missing or blocked. */
function deviceStorage(): ShortcutsStorage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

/**
 * Whether the shortcuts that are a plain typed key are on: every row of the table but Enter. On
 * until the person turns the switch in Settings off. It is a preference of the device, not task
 * data: like the theme it lives in `localStorage`, which signing out does not clear.
 */
export const shortcutsEnabled = signal(true)

/** Reads the switch as this device remembers it. `main.tsx` calls it before the first render. */
export function loadShortcutsPreference(storage = deviceStorage()): void {
  try {
    shortcutsEnabled.value = storage?.getItem(SHORTCUTS_STORAGE_KEY) !== `off`
  } catch {
    // Storage blocked: the shortcuts stay on, as on a device that never chose.
  }
}

/** Turns the shortcuts on or off and remembers it on this device. Off also closes their list. */
export function setShortcutsEnabled(on: boolean, storage = deviceStorage()): void {
  shortcutsEnabled.value = on
  if (!on) shortcutsOpen.value = false
  try {
    storage?.setItem(SHORTCUTS_STORAGE_KEY, on ? `on` : `off`)
  } catch {
    // Storage blocked or full: the choice holds until the page is closed.
  }
}

/**
 * Elements that take the keyboard for themselves: a dialog, an open menu and a listbox. No shortcut
 * fires inside one.
 */
const MODAL = `dialog, [role='dialog'], [role='alertdialog'], [role='menu'], [role='listbox']`

/** A key press as the matcher reads it. A `KeyboardEvent` is one. */
export type ShortcutPress = HotkeySequenceEvent

/**
 * The matcher for the table: call it with each key press and it returns the shortcut the press
 * completes, or `undefined`. It is `createHotkeyMatcher` over `SHORTCUTS`, with presses inside a
 * dialog, a menu or a listbox ignored.
 *
 * While `enabled` answers `false` (the switch in Settings is off), a key that types a character
 * does nothing: a letter, `/` or `?`, alone or as part of a sequence. That is what a resting hand
 * or dictation sends. Enter is not such a key and still opens the task whose check has the focus.
 * The table has no shortcut with Control, Alt or Meta, and the keys a dialog or a menu handles
 * itself (Escape, the arrows, Enter) never pass through here.
 */
export function createShortcutMatcher(
  enabled: () => boolean = () => shortcutsEnabled.value,
): (press: ShortcutPress) => ShortcutId | undefined {
  const bindings: HotkeyBinding<ShortcutId>[] = SHORTCUTS.flatMap((def) =>
    def.keys.map((keys) => ({ id: def.id, keys }))
  )
  return createHotkeyMatcher(bindings, {
    timeoutMs: SEQUENCE_TIMEOUT_MS,
    ignore: (press) =>
      (press.target as Element | null)?.closest?.(MODAL) != null ||
      (press.key.length === 1 && !enabled()),
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
