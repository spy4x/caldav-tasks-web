/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import {
  createShortcutMatcher,
  listShortcuts,
  loadShortcutsPreference,
  SEQUENCE_TIMEOUT_MS,
  setShortcutsEnabled,
  ShortcutId,
  type ShortcutPress,
  SHORTCUTS,
  SHORTCUTS_STORAGE_KEY,
  shortcutsEnabled,
  shortcutsOpen,
  type ShortcutsStorage,
} from "./shortcuts.ts"

let clock = 0

/** A key press at `at` milliseconds, on a plain page unless `over` says otherwise. */
function press(key: string, over: Partial<ShortcutPress> = {}): ShortcutPress {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: key === `?`,
    target: null,
    timeStamp: clock,
    ...over,
  }
}

/** Presses keys one after the other, `gap` milliseconds apart, and returns what each did. */
function run(keys: string[], gap = 100) {
  const match = createShortcutMatcher()
  clock = 1000
  return keys.map((key) => {
    clock += gap
    return match(press(key))
  })
}

const input = { tagName: `INPUT`, type: `text`, isContentEditable: false }

Deno.test("each single-key shortcut fires its action", () => {
  expect(run([`n`, `/`, `j`, `k`, `x`, `e`, `enter`, `?`])).toEqual([
    ShortcutId.NewTask,
    ShortcutId.Search,
    ShortcutId.NextTask,
    ShortcutId.PreviousTask,
    ShortcutId.CompleteTask,
    ShortcutId.EditTask,
    ShortcutId.EditTask,
    ShortcutId.Help,
  ])
})

Deno.test("g then t, u or l goes to Today, Upcoming or Lists", () => {
  expect(run([`g`, `t`, `g`, `u`, `g`, `l`])).toEqual([
    undefined,
    ShortcutId.GoToday,
    undefined,
    ShortcutId.GoUpcoming,
    undefined,
    ShortcutId.GoLists,
  ])
})

Deno.test("the second key of a sequence is dropped when it comes after the timeout", () => {
  expect(run([`g`, `t`], SEQUENCE_TIMEOUT_MS + 1)).toEqual([undefined, undefined])
  expect(run([`g`, `t`], SEQUENCE_TIMEOUT_MS)).toEqual([undefined, ShortcutId.GoToday])
})

Deno.test("another key between g and t cancels the sequence", () => {
  expect(run([`g`, `j`, `t`])).toEqual([undefined, ShortcutId.NextTask, undefined])
})

Deno.test("g pressed twice still waits for the second key of a sequence", () => {
  expect(run([`g`, `g`, `u`])).toEqual([undefined, undefined, ShortcutId.GoUpcoming])
})

Deno.test("t alone does nothing", () => {
  expect(run([`t`, `u`, `l`])).toEqual([undefined, undefined, undefined])
})

Deno.test("no shortcut fires while typing in a field, and typing cancels a waiting g", () => {
  const match = createShortcutMatcher()
  expect(match(press(`n`, { target: input }))).toBeUndefined()
  expect(match(press(`?`, { target: input }))).toBeUndefined()
  expect(match(press(`g`))).toBeUndefined()
  expect(match(press(`x`, { target: input, timeStamp: 1 }))).toBeUndefined()
  expect(match(press(`t`, { timeStamp: 2 }))).toBeUndefined()
})

Deno.test("no shortcut fires in a text area, a select or editable content", () => {
  const match = createShortcutMatcher()
  for (
    const target of [
      { tagName: `TEXTAREA`, isContentEditable: false },
      { tagName: `SELECT`, isContentEditable: false },
      { tagName: `DIV`, isContentEditable: true },
    ]
  ) {
    expect(match(press(`j`, { target }))).toBeUndefined()
  }
})

Deno.test("no shortcut fires inside a dialog", () => {
  const match = createShortcutMatcher()
  const inDialog = { tagName: `BUTTON`, isContentEditable: false, closest: () => ({}) }
  expect(match(press(`x`, { target: inDialog }))).toBeUndefined()
})

Deno.test("a key with Control, Alt or Meta held is left to the browser", () => {
  const match = createShortcutMatcher()
  expect(match(press(`n`, { ctrlKey: true }))).toBeUndefined()
  expect(match(press(`n`, { altKey: true }))).toBeUndefined()
  expect(match(press(`n`, { metaKey: true }))).toBeUndefined()
  expect(match(press(`n`, { isComposing: true }))).toBeUndefined()
})

Deno.test("a capital letter is not the shortcut for its lower case", () => {
  const match = createShortcutMatcher()
  expect(match(press(`N`, { shiftKey: true }))).toBeUndefined()
})

Deno.test("the matcher and the dialog read the same table", () => {
  const listed = listShortcuts()
  expect(listed.map((row) => row.description)).toEqual(SHORTCUTS.map((def) => def.description))
  // Every action has a row, so none can fire without being listed.
  const ids = new Set(SHORTCUTS.map((def) => def.id))
  for (const id of Object.values(ShortcutId).filter((v) => typeof v === `number`)) {
    expect(ids.has(id as ShortcutId)).toBe(true)
  }
})

Deno.test("the dialog draws a sequence as keys joined by a space and a single key as itself", () => {
  const keys = new Map(listShortcuts().map((row) => [row.description, row.keys]))
  expect(keys.get(`Go to Upcoming`)).toBe(`g u`)
  expect(keys.get(`Show keyboard shortcuts`)).toBe(`?`)
  expect(keys.get(`New task`)).toBe(`n`)
})

Deno.test("each dialog row shows exactly the keys that trigger its shortcut", () => {
  const rows = listShortcuts()
  expect(rows).toHaveLength(SHORTCUTS.length)
  SHORTCUTS.forEach((def, at) => {
    const match = createShortcutMatcher()
    clock = 1000
    const fired = rows[at].keys.split(` `).map((key) => {
      clock += 100
      return match(press(key === `enter` ? `Enter` : key))
    })
    expect(fired.at(-1)).toBe(def.id)
    expect(fired.slice(0, -1).every((id) => id === undefined)).toBe(true)
    // It is the first way of the table, the one the description does not already name.
    expect(rows[at].keys).toBe(def.keys[0].join(` `))
  })
})

/** Presses keys as {@link run} does, with the switch in Settings off. */
function runOff(keys: string[]) {
  const match = createShortcutMatcher(() => false)
  clock = 1000
  return keys.map((key) => {
    clock += 100
    return match(press(key))
  })
}

Deno.test("with the switch off no key that types a character fires, alone or in a sequence", () => {
  const keys = SHORTCUTS.flatMap((def) => def.keys.flat()).filter((key) => key.length === 1)
  expect(keys).toEqual([`n`, `j`, `k`, `x`, `e`, `/`, `g`, `t`, `g`, `u`, `g`, `l`, `?`])
  expect(runOff(keys)).toEqual(keys.map(() => undefined))
})

Deno.test("with the switch off Enter still edits the focused task", () => {
  expect(runOff([`Enter`])).toEqual([ShortcutId.EditTask])
})

Deno.test("the matcher follows the switch as it is turned, without being made again", () => {
  let on = true
  const match = createShortcutMatcher(() => on)
  clock = 1000
  expect(match(press(`n`))).toBe(ShortcutId.NewTask)
  on = false
  expect(match(press(`n`))).toBe(undefined)
  on = true
  expect(match(press(`n`))).toBe(ShortcutId.NewTask)
})

/** A device's storage in memory. */
function memory(
  initial: Record<string, string> = {},
): ShortcutsStorage & { kept: Map<string, string> } {
  const kept = new Map(Object.entries(initial))
  return {
    kept,
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => void kept.set(key, value),
  }
}

Deno.test("shortcuts are on for a device that never turned the switch", () => {
  shortcutsEnabled.value = false
  loadShortcutsPreference(memory())
  expect(shortcutsEnabled.value).toBe(true)
})

Deno.test("turning the switch off is remembered on the device, and so is turning it back on", () => {
  const device = memory()
  setShortcutsEnabled(false, device)
  expect(shortcutsEnabled.value).toBe(false)
  // A reload starts from the default and reads the device.
  shortcutsEnabled.value = true
  loadShortcutsPreference(device)
  expect(shortcutsEnabled.value).toBe(false)

  setShortcutsEnabled(true, device)
  shortcutsEnabled.value = false
  loadShortcutsPreference(device)
  expect(shortcutsEnabled.value).toBe(true)
  expect([...device.kept.keys()]).toEqual([SHORTCUTS_STORAGE_KEY])
})

Deno.test("turning the switch off closes the list of shortcuts", () => {
  shortcutsOpen.value = true
  setShortcutsEnabled(false, memory())
  expect(shortcutsOpen.value).toBe(false)
  setShortcutsEnabled(true, memory())
})

Deno.test("a device whose storage is blocked keeps shortcuts on and the switch still turns", () => {
  const blocked: ShortcutsStorage = {
    getItem: () => {
      throw new Error(`blocked`)
    },
    setItem: () => {
      throw new Error(`blocked`)
    },
  }
  shortcutsEnabled.value = true
  loadShortcutsPreference(blocked)
  expect(shortcutsEnabled.value).toBe(true)
  setShortcutsEnabled(false, blocked)
  expect(shortcutsEnabled.value).toBe(false)
  shortcutsEnabled.value = true
})
