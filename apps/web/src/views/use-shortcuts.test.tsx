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
function Page(
  { log, path = `/`, quickAdd = false, search = false }: {
    log: string[]
    path?: string
    quickAdd?: boolean
    search?: boolean
  },
) {
  useShortcuts((to) => log.push(`go ${to}`), path)
  return (
    <div>
      <input id="field" type="text" />
      {quickAdd && <input data-e2e="quick-add-input" type="text" />}
      {search && <input data-e2e="search-input" type="search" value="foo" />}
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
  await mount(<Page log={log} />, async ({ window }) => {
    const body = window.document.body as unknown as Element
    await key(window as never, body, `j`)
    await key(window as never, body, `j`)
    expect(rowOf(window)).toBe(`b`)
    await key(window as never, window.document.activeElement as unknown as Element, `k`)
    expect(rowOf(window)).toBe(`a`)
    await key(window as never, window.document.activeElement as unknown as Element, `j`)
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
    expect(window.document.activeElement?.id).toBe(`field`)
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

/** The uid of the row that holds the focus, or a word saying none does. */
function rowOf(window: { document: { activeElement: unknown } }): string {
  const row = (window.document.activeElement as Element | null)?.closest?.(`li[data-task-uid]`)
  return row?.getAttribute(`data-task-uid`) ?? `no row`
}

Deno.test("n focuses the quick add on the same key press and keeps the key from typing", async () => {
  await mount(<Page log={[]} quickAdd />, async ({ window }) => {
    const kept = await key(window as never, window.document.body as never, `n`)
    expect(kept).toBe(false)
    expect(window.document.activeElement?.getAttribute(`data-e2e`)).toBe(`quick-add-input`)
  })
})

Deno.test("n on a page without a quick add goes to Today and focuses the field when it appears", async () => {
  const log: string[] = []
  await mount(<Page log={log} />, async ({ window, rerender }) => {
    await key(window as never, window.document.body as never, `n`)
    expect(log).toEqual([`go /`])
    await rerender(<Page log={log} quickAdd />)
    await act(() => new Promise((done) => setTimeout(done, 10)))
    expect(window.document.activeElement?.getAttribute(`data-e2e`)).toBe(`quick-add-input`)
  })
})

Deno.test("/ on the search page focuses the field and keeps the query and the address", async () => {
  const log: string[] = []
  await mount(<Page log={log} path="/search" search />, async ({ root, window }) => {
    await key(window as never, window.document.body as never, `/`)
    expect(log).toEqual([])
    expect(window.document.activeElement?.getAttribute(`data-e2e`)).toBe(`search-input`)
    expect(must<HTMLInputElement>(root, `[data-e2e="search-input"]`).value).toBe(`foo`)
  })
})

Deno.test("in the task editor g t, g u, g l, n and / do nothing but ? still opens the list", async () => {
  const log: string[] = []
  shortcutsOpen.value = false
  await mount(<Page log={log} path="/tasks/abc" quickAdd />, async ({ window }) => {
    const body = window.document.body as never
    for (const name of [`g`, `t`, `g`, `u`, `g`, `l`, `n`, `/`]) {
      expect(await key(window as never, body, name)).toBe(true)
    }
    expect(log).toEqual([])
    expect(window.document.activeElement).toBe(window.document.body)
    await key(window as never, body, `?`)
    expect(shortcutsOpen.value).toBe(true)
  })
  shortcutsOpen.value = false
})
