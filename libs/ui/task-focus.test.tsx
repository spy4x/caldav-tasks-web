/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { useState } from "preact/hooks"
import { focused, mount, must } from "./mount.test.tsx"
import { completeFocusedRow, editFocusedRow, FocusKeeper, moveRowFocus } from "./task-focus.tsx"
import { makeTask } from "./task-fixtures.ts"
import { flatNodes, TaskTree } from "./task-tree.tsx"
import type { Task } from "@spy4x/time/ical-tasks-model"

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
            // A kept row still re-renders, as it does when the server answers.
            setTasks((current) => keep ? [...current] : current.filter((t) => t.uid !== task.uid))
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

Deno.test("a row that stays gets focus back on its own check when the page dropped it", async () => {
  await mount(<Harness initial={THREE} keep />, async ({ root, window, act }) => {
    check(root, `a`).focus()
    await act(() => {
      check(root, `a`).click()
      check(root, `a`).blur()
    })
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

function openOf(root: ParentNode, uid: string) {
  return must<HTMLElement>(root, `li[data-task-uid="${uid}"] [data-e2e="task-open"]`)
}

Deno.test("next and previous move a visible focus through the rows and stop at the ends", async () => {
  await mount(<Harness initial={THREE} />, async ({ window }) => {
    const doc = window.document as unknown as Document
    expect(moveRowFocus(doc, 1)).toBe(true)
    expect(focused(window)).toBe(`button task-open`)
    expect(rowOf(window)).toBe(`a`)
    moveRowFocus(doc, 1)
    expect(rowOf(window)).toBe(`b`)
    moveRowFocus(doc, 1)
    moveRowFocus(doc, 1)
    expect(rowOf(window)).toBe(`c`)
    moveRowFocus(doc, -1)
    expect(rowOf(window)).toBe(`b`)
    moveRowFocus(doc, -1)
    moveRowFocus(doc, -1)
    expect(rowOf(window)).toBe(`a`)
  })
})

Deno.test("previous with no row focused starts at the last row", async () => {
  await mount(<Harness initial={THREE} />, async ({ window }) => {
    moveRowFocus(window.document as unknown as Document, -1)
    expect(rowOf(window)).toBe(`c`)
  })
})

Deno.test("completing the focused row completes that task and not its neighbours", async () => {
  const done: string[] = []
  await mount(
    <TaskTree
      label="Tasks"
      nodes={flatNodes(THREE)}
      zone="UTC"
      now={NOW}
      onComplete={(task) => done.push(task.uid)}
      onOpen={() => {}}
    />,
    async ({ root, window, act }) => {
      openOf(root, `b`).focus()
      await act(() => {
        expect(completeFocusedRow(window.document as unknown as Document)).toBe(true)
      })
      expect(done).toEqual([`b`])
    },
  )
})

Deno.test("completing with no focused row does nothing", async () => {
  await mount(<Harness initial={THREE} />, async ({ root, window }) => {
    expect(completeFocusedRow(window.document as unknown as Document)).toBe(false)
    expect(root.querySelectorAll(`li`)).toHaveLength(3)
  })
})

Deno.test("editing the focused row opens that row's task", async () => {
  const opened: string[] = []
  await mount(
    <TaskTree
      label="Tasks"
      nodes={flatNodes(THREE)}
      zone="UTC"
      now={NOW}
      onComplete={() => {}}
      onOpen={(task) => opened.push(task.uid)}
    />,
    async ({ root, window }) => {
      const doc = window.document as unknown as Document
      expect(editFocusedRow(doc)).toBe(false)
      openOf(root, `c`).focus()
      expect(editFocusedRow(doc)).toBe(true)
      expect(opened).toEqual([`c`])
    },
  )
})

/** The uid of the row that holds the focus, or a word saying none does. */
function rowOf(window: { document: { activeElement: unknown } }): string {
  const row = (window.document.activeElement as Element | null)?.closest?.(`li[data-task-uid]`)
  return row?.getAttribute(`data-task-uid`) ?? `no row`
}
