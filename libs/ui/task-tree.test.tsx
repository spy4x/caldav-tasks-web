/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { mount, must, texts } from "./mount.test.tsx"
import { makeTask } from "./task-fixtures.ts"
import { TaskTree } from "./task-tree.tsx"
import { buildTree } from "../tasks/tree.ts"

const NOW = new Date(`2026-10-08T09:00:00Z`)
const TASKS = [
  makeTask(`p`, `Paint the room`, { sortOrder: 1 }),
  makeTask(`c1`, `Buy paint`, { parentUid: `p`, sortOrder: 1 }),
  makeTask(`g`, `Check the shade`, { parentUid: `c1`, sortOrder: 1 }),
  makeTask(`c2`, `Tape the edges`, { parentUid: `p`, sortOrder: 2 }),
  makeTask(`o`, `Fix the door`, { sortOrder: 2 }),
]
const tree = (collapsed?: ReadonlySet<string>) => (
  <TaskTree
    label="Tasks"
    nodes={buildTree(TASKS, `UTC`)}
    zone="UTC"
    now={NOW}
    collapsed={collapsed}
    onComplete={() => {}}
    onOpen={() => {}}
  />
)
const titles = (root: ParentNode) => texts(root, `[data-e2e="task-open"]`)

Deno.test("subtasks are listed under their parent, indented by depth", async () => {
  await mount(tree(), async ({ root }) => {
    expect(titles(root)).toEqual([
      `Paint the room`,
      `Buy paint`,
      `Check the shade`,
      `Tape the edges`,
      `Fix the door`,
    ])
    const indent = [...root.querySelectorAll(`[data-e2e="task-row"]`)].map((row) =>
      row.className.match(/ps-\d+/)?.[0]
    )
    expect(indent).toEqual([`ps-0`, `ps-6`, `ps-12`, `ps-6`, `ps-0`])
  })
})

Deno.test("a collapsed task hides all its descendants and its expander says Show", async () => {
  await mount(tree(new Set([`p`])), async ({ root }) => {
    expect(titles(root)).toEqual([`Paint the room`, `Fix the door`])
    const expander = must<HTMLButtonElement>(root, `[data-e2e="task-expand"]`)
    expect(expander.getAttribute(`aria-expanded`)).toBe(`false`)
    expect(expander.getAttribute(`aria-label`)).toBe(`Show 3 subtasks of Paint the room`)
  })
})

Deno.test("the expander button collapses the subtasks and a second press expands them", async () => {
  await mount(tree(), async ({ root, act }) => {
    const expander = must<HTMLButtonElement>(root, `[data-e2e="task-expand"]`)
    await act(() => expander.click())
    expect(titles(root)).toEqual([`Paint the room`, `Fix the door`])
    await act(() => expander.click())
    expect(titles(root)).toHaveLength(5)
  })
})

Deno.test("Left Arrow on a row collapses its subtasks and Right Arrow expands them", async () => {
  await mount(tree(), async ({ root, window, act }) => {
    const parent = must<HTMLButtonElement>(root, `[data-task-uid="p"] [data-e2e="task-open"]`)
    const key = (key: string) =>
      act(() => {
        parent.dispatchEvent(new window.KeyboardEvent(`keydown`, { key, bubbles: true }) as never)
      })
    await key(`ArrowLeft`)
    expect(titles(root)).toEqual([`Paint the room`, `Fix the door`])
    await key(`ArrowRight`)
    expect(titles(root)).toHaveLength(5)
  })
})

Deno.test("collapsing a task leaves the other tasks' state alone", async () => {
  await mount(tree(), async ({ root, act }) => {
    // Collapse "Buy paint" (it has the one grandchild); "Paint the room" stays open.
    const expander = (uid: string) =>
      must<HTMLButtonElement>(root, `[data-task-uid="${uid}"] [data-e2e="task-expand"]`)
    await act(() => expander(`c1`).click())
    expect(titles(root)).toEqual([`Paint the room`, `Buy paint`, `Tape the edges`, `Fix the door`])
    // Folding the parent away and back must not forget that "Buy paint" is folded.
    await act(() => expander(`p`).click())
    expect(titles(root)).toEqual([`Paint the room`, `Fix the door`])
    await act(() => expander(`p`).click())
    expect(titles(root)).toEqual([`Paint the room`, `Buy paint`, `Tape the edges`, `Fix the door`])
  })
})
