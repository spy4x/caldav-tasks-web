/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { act } from "preact/test-utils"
import { makeTask } from "@ui/task-fixtures.ts"
import { flatNodes, TaskTree } from "@ui/task-tree.tsx"
import { focused, mount, must } from "@ui/mount.test.tsx"
import { Dropdown, DropdownItem } from "@spy4x/preact-ui/dropdown"
import { UnsavedGuard } from "@spy4x/preact-ui/unsaved-guard"
import { leaveGuard } from "../leave-guard.ts"
import { shortcutsEnabled, shortcutsOpen } from "../shortcuts.ts"
import { useShortcuts } from "./use-shortcuts.ts"

const NOW = new Date(`2026-10-08T09:00:00Z`)
const TASKS = [makeTask(`a`, `Alpha`), makeTask(`b`, `Bravo`)]

/**
 * The app's shortcuts over two rows and a text field, with the log of what they did. `manual` draws
 * the rows as a list page in manual order does; `menu` adds a "More actions" menu and a listbox.
 */
function Page(
  { log, quickAdd = false, search = false, unsaved = false, manual = false, menu = false }: {
    log: string[]
    quickAdd?: boolean
    search?: boolean
    unsaved?: boolean
    manual?: boolean
    menu?: boolean
  },
) {
  useShortcuts((to) => log.push(`go ${to}`))
  return (
    <div>
      {unsaved && (
        <UnsavedGuard
          when
          navigate={() => {}}
          owns={() => true}
          leaveGuard={leaveGuard}
        />
      )}
      <input id="field" type="text" />
      {quickAdd && <input data-e2e="quick-add-input" type="text" />}
      {search && <input data-e2e="search-input" type="search" value="foo" />}
      {menu && (
        <>
          <Dropdown trigger="…" triggerLabel="More actions">
            <DropdownItem onClick={() => log.push(`delete`)}>Delete list</DropdownItem>
          </Dropdown>
          <ul role="listbox" aria-label="Colour">
            <li role="option" aria-selected="false" tabIndex={0} id="option">Red</li>
          </ul>
        </>
      )}
      <TaskTree
        label="Tasks"
        nodes={flatNodes(TASKS)}
        zone="UTC"
        now={NOW}
        onComplete={(task) => log.push(`complete ${task.uid}`)}
        onOpen={(task) => log.push(`open ${task.uid}`)}
        onReorder={manual ? () => {} : undefined}
      />
    </div>
  )
}

/**
 * Presses a key on an element of the page. Returns whether the page left it uncancelled. `repeat`
 * marks the press as one the keyboard sent because the key is held down.
 */
function key(
  window: { KeyboardEvent: typeof KeyboardEvent },
  on: Element,
  name: string,
  repeat = false,
) {
  const event = new window.KeyboardEvent(`keydown`, {
    key: name,
    bubbles: true,
    cancelable: true,
    repeat,
  })
  return act(() => void on.dispatchEvent(event)).then(() => !event.defaultPrevented)
}

/** The focused element, where the next key press lands. */
const active = (window: { document: { activeElement: unknown } }) =>
  window.document.activeElement as Element

Deno.test("on a list in manual order j and k move between rows, x completes and e opens the row", async () => {
  const log: string[] = []
  await mount(<Page log={log} manual />, async ({ root, window }) => {
    // The page under test is the one that draws no row as a list item.
    expect(root.querySelectorAll(`li[data-task-uid]`)).toHaveLength(0)
    await key(window as never, window.document.body as never, `j`)
    expect(rowOf(window)).toBe(`a`)
    await key(window as never, active(window), `j`)
    expect(rowOf(window)).toBe(`b`)
    await key(window as never, active(window), `k`)
    expect(rowOf(window)).toBe(`a`)
    await key(window as never, active(window), `x`)
    await key(window as never, active(window), `e`)
    expect(log).toEqual([`complete a`, `open a`])
  })
})

Deno.test("with More actions open, n, j, x and g t do nothing and the menu keeps the focus", async () => {
  const log: string[] = []
  await mount(<Page log={log} menu />, async ({ root, window }) => {
    await act(() => must<HTMLButtonElement>(root, `[aria-label="More actions"]`).click())
    const item = must<HTMLElement>(root, `[role="menu"] [role="menuitem"]`)
    item.focus()
    for (const name of [`n`, `j`, `x`, `e`, `g`, `t`]) {
      expect(await key(window as never, active(window), name)).toBe(true)
    }
    expect(log).toEqual([])
    expect(active(window).getAttribute(`role`)).toBe(`menuitem`)
  })
})

Deno.test("a key pressed on an option of a listbox fires no shortcut", async () => {
  const log: string[] = []
  await mount(<Page log={log} menu />, async ({ root, window }) => {
    const option = must<HTMLElement>(root, `#option`)
    option.focus()
    for (const name of [`n`, `j`, `x`]) {
      expect(await key(window as never, option, name)).toBe(true)
    }
    expect(log).toEqual([])
    expect(active(window).id).toBe(`option`)
  })
})

Deno.test("a held x completes the focused task once", async () => {
  const log: string[] = []
  await mount(<Page log={log} />, async ({ window }) => {
    await key(window as never, window.document.body as never, `j`)
    await key(window as never, active(window), `x`)
    await key(window as never, active(window), `x`, true)
    await key(window as never, active(window), `x`, true)
    expect(log).toEqual([`complete a`])
  })
})

Deno.test("a held e or n acts once, and the repeats do not reach the browser", async () => {
  const log: string[] = []
  await mount(<Page log={log} />, async ({ window }) => {
    const body = window.document.body as never
    await key(window as never, body, `j`)
    await key(window as never, active(window), `e`)
    expect(await key(window as never, active(window), `e`, true)).toBe(false)
    expect(log).toEqual([`open a`])
    await key(window as never, body, `n`)
    expect(await key(window as never, body, `n`, true)).toBe(false)
    expect(log).toEqual([`open a`, `go /`])
  })
})

Deno.test("a held j keeps moving down the rows and a held k back up", async () => {
  await mount(<Page log={[]} />, async ({ window }) => {
    await key(window as never, window.document.body as never, `j`)
    await key(window as never, active(window), `j`, true)
    expect(rowOf(window)).toBe(`b`)
    await key(window as never, active(window), `k`, true)
    expect(rowOf(window)).toBe(`a`)
  })
})

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

Deno.test("with the switch off, n, j, x, e, /, g t and ? do nothing and the keys reach the browser", async () => {
  const log: string[] = []
  shortcutsOpen.value = false
  shortcutsEnabled.value = false
  try {
    await mount(<Page log={log} quickAdd />, async ({ root, window }) => {
      const check = must<HTMLInputElement>(root, `input[data-task-check="a"]`)
      check.focus()
      for (const name of [`n`, `j`, `x`, `e`, `/`, `g`, `t`, `?`]) {
        expect(await key(window as never, active(window), name)).toBe(true)
      }
      expect(log).toEqual([])
      expect(active(window)).toBe(check)
      expect(shortcutsOpen.value).toBe(false)
    })
  } finally {
    shortcutsEnabled.value = true
  }
})

Deno.test("turning the switch back on makes the shortcuts work again on the same page", async () => {
  const log: string[] = []
  shortcutsEnabled.value = false
  try {
    await mount(<Page log={log} />, async ({ root, window }) => {
      const check = must<HTMLInputElement>(root, `input[data-task-check="a"]`)
      check.focus()
      await key(window as never, check, `x`)
      expect(log).toEqual([])
      shortcutsEnabled.value = true
      await key(window as never, check, `x`)
      expect(log).toEqual([`complete a`])
    })
  } finally {
    shortcutsEnabled.value = true
  }
})

Deno.test("with the switch off, Enter on a row's check still opens the task", async () => {
  const log: string[] = []
  shortcutsEnabled.value = false
  try {
    await mount(<Page log={log} />, async ({ root, window }) => {
      const check = must<HTMLInputElement>(root, `input[data-task-check="a"]`)
      check.focus()
      await key(window as never, check, `Enter`)
      expect(log).toEqual([`open a`])
    })
  } finally {
    shortcutsEnabled.value = true
  }
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
  const row = (window.document.activeElement as Element | null)?.closest?.(`[data-task-uid]`)
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
  await mount(<Page log={log} search />, async ({ root, window }) => {
    await key(window as never, window.document.body as never, `/`)
    expect(log).toEqual([])
    expect(window.document.activeElement?.getAttribute(`data-e2e`)).toBe(`search-input`)
    expect(must<HTMLInputElement>(root, `[data-e2e="search-input"]`).value).toBe(`foo`)
  })
})

/** Lets the mutation observers run. */
const observed = () => act(() => new Promise<void>((done) => setTimeout(done, 10)))

Deno.test("after it has focused the new-task field, n stops watching the page", async () => {
  await mount(<Page log={[]} />, async ({ window, rerender }) => {
    await key(window as never, window.document.body as never, `n`)
    await rerender(<Page log={[]} quickAdd />)
    await observed()
    expect(focused(window)).toBe(`input quick-add-input`)
    ;(window.document.activeElement as unknown as HTMLElement).blur()
    await rerender(<Page log={[]} />)
    await rerender(<Page log={[]} quickAdd />)
    await observed()
    expect(focused(window)).toBe(`body `)
  })
})

Deno.test("n off Today leaves the focus where the person moved it before the field appears", async () => {
  await mount(<Page log={[]} />, async ({ root, window, rerender }) => {
    await key(window as never, window.document.body as never, `n`)
    must<HTMLInputElement>(root, `#field`).focus()
    await rerender(<Page log={[]} quickAdd />)
    await observed()
    expect(focused(window)).toBe(`input field`)
  })
})

Deno.test("a second shortcut replaces the first one's wait for its field", async () => {
  const log: string[] = []
  await mount(<Page log={log} />, async ({ window, rerender }) => {
    await key(window as never, window.document.body as never, `n`)
    await key(window as never, window.document.body as never, `/`)
    expect(log).toEqual([`go /`, `go /search`])
    await rerender(<Page log={log} quickAdd search />)
    await observed()
    expect(focused(window)).toBe(`input search-input`)
  })
})

Deno.test("g t asks before leaving while the page holds unsaved changes, and Leave then goes", async () => {
  const log: string[] = []
  await mount(<Page log={log} unsaved />, async ({ window }) => {
    const body = window.document.body as never
    await key(window as never, body, `g`)
    await key(window as never, body, `t`)
    expect(log).toEqual([])
    const leave = [...window.document.querySelectorAll(`button`)].find((b) =>
      b.textContent?.trim() === `Leave`
    )
    expect(leave).toBeDefined()
    await act(() => void leave!.click())
    expect(log).toEqual([`go /`])
  })
})
