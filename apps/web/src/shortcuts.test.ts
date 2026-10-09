/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import {
  createShortcutMatcher,
  listShortcuts,
  SEQUENCE_TIMEOUT_MS,
  ShortcutId,
  type ShortcutPress,
  SHORTCUTS,
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
