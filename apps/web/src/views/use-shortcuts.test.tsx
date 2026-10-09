/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { act } from "preact/test-utils"
import { makeTask } from "@ui/task-fixtures.ts"
import { flatNodes, TaskTree } from "@ui/task-tree.tsx"
import { mount, must } from "@ui/mount.test.tsx"
import { shortcutsOpen } from "../shortcuts.ts"
import { useShortcuts } from "./use-shortcuts.ts"

const NOW = new Date(`2026-10-08T09:00:00Z`)
const TASKS = [makeTask(`a`, `Alpha`), makeTask(`b`, `Bravo`)]

/** The app's shortcuts over two rows and a text field, with the log of what they did. */
function Page({ log }: { log: string[] }) {
  useShortcuts((to) => log.push(`go ${to}`))
  return (
    <div>
      <input id="field" type="text" />
      <TaskTree
        label="Tasks"
        nodes={flatNodes(TASKS)}
        zone="UTC"
        now={NOW}
        onComplete={(task) => log.push(`complete ${task.uid}`)}
        onOpen={(task) => log.push(`open ${task.uid}`)}
      />
    </div>
  )
}

/** Presses a key on an element of the page. Returns whether the page left it uncancelled. */
function key(window: { KeyboardEvent: typeof KeyboardEvent }, on: Element, name: string) {
  const event = new window.KeyboardEvent(`keydown`, { key: name, bubbles: true, cancelable: true })
  return act(() => void on.dispatchEvent(event)).then(() => !event.defaultPrevented)
}

Deno.test("j, x and e act on the row the keyboard is on", async () => {
  const log: string[] = []
  await mount(<Page log={log} />, async ({ root, window }) => {
    const body = window.document.body as unknown as Element
    await key(window as never, body, `j`)
    await key(window as never, body, `j`)
    expect(window.document.activeElement).toBe(
      must(root, `li[data-task-uid="b"] [data-e2e="task-open"]`),
    )
    await key(window as never, window.document.activeElement as unknown as Element, `x`)
    await key(window as never, window.document.activeElement as unknown as Element, `e`)
    expect(log).toEqual([`complete b`, `open b`])
  })
})

Deno.test("g then t and g then u navigate to Today and Upcoming", async () => {
  const log: string[] = []
  await mount(<Page log={log} />, async ({ window }) => {
    const body = window.document.body as unknown as Element
    for (const name of [`g`, `t`, `g`, `u`, `g`, `l`]) await key(window as never, body, name)
    expect(log).toEqual([`go /`, `go /upcoming`, `go /lists`])
  })
})

Deno.test("typing j, x or ? in a field fires nothing and keeps the key", async () => {
  const log: string[] = []
  shortcutsOpen.value = false
  await mount(<Page log={log} />, async ({ root, window }) => {
    const field = must<HTMLInputElement>(root, `#field`)
    field.focus()
    for (const name of [`j`, `x`, `e`, `?`]) {
      expect(await key(window as never, field, name)).toBe(true)
    }
    expect(log).toEqual([])
    expect(shortcutsOpen.value).toBe(false)
    expect(window.document.activeElement).toBe(field)
  })
})

Deno.test("? opens the shortcuts list", async () => {
  shortcutsOpen.value = false
  await mount(<Page log={[]} />, async ({ window }) => {
    await key(window as never, window.document.body as never, `?`)
    expect(shortcutsOpen.value).toBe(true)
  })
  shortcutsOpen.value = false
})

Deno.test("Enter on a row's check opens the task, and on a button leaves the button to act", async () => {
  const log: string[] = []
  await mount(<Page log={log} />, async ({ root, window }) => {
    const check = must<HTMLInputElement>(root, `input[data-task-check="a"]`)
    check.focus()
    await key(window as never, check, `Enter`)
    expect(log).toEqual([`open a`])
    const button = must(root, `li[data-task-uid="b"] [data-e2e="task-open"]`)
    expect(await key(window as never, button, `Enter`)).toBe(true)
    expect(log).toEqual([`open a`])
  })
})
