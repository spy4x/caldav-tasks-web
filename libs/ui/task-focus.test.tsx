/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { useState } from "preact/hooks"
import { focused, mount, must } from "./mount.test.tsx"
import { FocusKeeper } from "./task-focus.tsx"
import { makeTask } from "./task-fixtures.ts"
import { flatNodes, TaskTree } from "./task-tree.tsx"
import type { Task } from "../tasks/types.ts"

const NOW = new Date(`2026-10-08T09:00:00Z`)
const THREE = [makeTask(`a`, `Alpha`), makeTask(`b`, `Bravo`), makeTask(`c`, `Charlie`)]

/** A list that drops a task when it is checked, as Today does once the server has accepted it. */
function Harness({ initial, keep = false }: { initial: Task[]; keep?: boolean }) {
  const [tasks, setTasks] = useState(initial)
  return (
    <div>
      <button type="button" id="elsewhere">Elsewhere</button>
      <FocusKeeper label="Tasks">
        <TaskTree
          label="Tasks"
          nodes={flatNodes(tasks)}
          zone="UTC"
          now={NOW}
          onComplete={(task) => {
            if (!keep) setTasks((current) => current.filter((t) => t.uid !== task.uid))
          }}
          onOpen={() => {}}
        />
      </FocusKeeper>
    </div>
  )
}

const check = (root: ParentNode, uid: string) =>
  must<HTMLInputElement>(root, `input[data-task-check="${uid}"]`)

Deno.test("checking a row that leaves moves focus to the next row's check", async () => {
  await mount(<Harness initial={THREE} />, async ({ root, window, act }) => {
    check(root, `a`).focus()
    await act(() => check(root, `a`).click())
    expect(root.querySelector(`input[data-task-check="a"]`)).toBeNull()
    expect(focused(window)).toBe(`check b`)
  })
})

Deno.test("checking the last row moves focus to the check before it", async () => {
  await mount(<Harness initial={THREE} />, async ({ root, window, act }) => {
    check(root, `c`).focus()
    await act(() => check(root, `c`).click())
    expect(focused(window)).toBe(`check b`)
  })
})

Deno.test("checking the only row moves focus to the task region, not to the top of the page", async () => {
  await mount(<Harness initial={[THREE[0]]} />, async ({ root, window, act }) => {
    check(root, `a`).focus()
    await act(() => check(root, `a`).click())
    expect(focused(window)).toBe(`div Tasks`)
  })
})

Deno.test("a row that stays keeps focus on its own check", async () => {
  await mount(<Harness initial={THREE} keep />, async ({ root, window, act }) => {
    check(root, `a`).focus()
    await act(() => check(root, `a`).click())
    expect(focused(window)).toBe(`check a`)
  })
})

Deno.test("focus the person moved elsewhere is left where they put it", async () => {
  await mount(<Harness initial={THREE} />, async ({ root, window, act }) => {
    check(root, `a`).focus()
    await act(() => {
      check(root, `a`).click()
      must<HTMLButtonElement>(root, `#elsewhere`).focus()
    })
    expect(window.document.activeElement?.id).toBe(`elsewhere`)
  })
})
