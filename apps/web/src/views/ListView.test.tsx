/// <reference lib="deno.ns" />
import "fake-indexeddb/auto"
import { expect } from "@std/expect"
import { memoryLocation } from "wouter-preact/memory-location"
import { Route, Router } from "wouter-preact"
import { onPage } from "./on-page.test.tsx"
import { withApp } from "../state/testing.ts"
import { ROUTES } from "../routes.ts"
import { ListView } from "./ListView.tsx"
import { act } from "preact/test-utils"
import { refresh } from "../state/sync.ts"

Deno.test(`a list page says it is loading while the lists are not known yet`, async () => {
  await withApp(async () => {
    const { hook } = memoryLocation({ path: `/lists/errands` })
    await onPage(
      <Router hook={hook}>
        <Route path={ROUTES.list}>
          <ListView />
        </Route>
      </Router>,
      ({ root }) => {
        const status = root.querySelector(`[role="status"]`)
        expect(status?.textContent).toBe(`Loading list`)
        return Promise.resolve()
      },
    )
  })
})

Deno.test(`"2 lists" shows a second list beside the first, and its menu picks another`, async () => {
  // The layout choice is remembered in the browser; start from none.
  try {
    localStorage.clear()
  } catch { /* no storage here */ }
  await withApp(async (server) => {
    server.calendarList = [
      { href: `/dav/tasks/errands/`, displayName: `Errands`, changeMarker: `c1` },
      { href: `/dav/tasks/work/`, displayName: `Work`, changeMarker: `c1` },
      { href: `/dav/tasks/home/`, displayName: `Home`, changeMarker: `c1` },
    ]
    await refresh()
    const { hook } = memoryLocation({ path: `/lists/errands` })
    await onPage(
      <Router hook={hook}>
        <Route path={ROUTES.list}>
          <ListView />
        </Route>
      </Router>,
      async ({ root }) => {
        const button = root.querySelector<HTMLButtonElement>(`#two-lists-switch`)
        await act(() => button?.click())
        const select = root.querySelector<HTMLSelectElement>(`[data-e2e="second-list-select"]`)
        const placeholder = () =>
          root.querySelector(`[data-e2e="pane-add"] textarea`)?.getAttribute(`placeholder`)
        expect(placeholder()).toBe(`Add a task to Home…`)
        // Lists sort by name; the first other one shows until another is picked.
        expect([...select!.options].map((o) => o.text)).toEqual([`Home`, `Work`])
        await act(() => {
          select!.value = `/dav/tasks/work/`
          const view = select!.ownerDocument.defaultView as unknown as typeof globalThis
          select!.dispatchEvent(new view.Event(`change`, { bubbles: true }))
        })
        expect(placeholder()).toBe(`Add a task to Work…`)
      },
    )
  })
})

Deno.test(`the main list's menu goes to another list, and picking the second list swaps the two`, async () => {
  try {
    localStorage.clear()
  } catch { /* no storage here */ }
  await withApp(async (server) => {
    server.calendarList = [
      { href: `/dav/tasks/errands/`, displayName: `Errands`, changeMarker: `c1` },
      { href: `/dav/tasks/work/`, displayName: `Work`, changeMarker: `c1` },
      { href: `/dav/tasks/home/`, displayName: `Home`, changeMarker: `c1` },
    ]
    await refresh()
    const { hook, history } = memoryLocation({ path: `/lists/errands`, record: true })
    await onPage(
      <Router hook={hook}>
        <Route path={ROUTES.list}>
          <ListView />
        </Route>
      </Router>,
      async ({ root }) => {
        await act(() => root.querySelector<HTMLButtonElement>(`#two-lists-switch`)?.click())
        const pick = async (e2e: string, value: string) => {
          const select = root.querySelector<HTMLSelectElement>(`[data-e2e="${e2e}"]`)!
          await act(() => {
            select.value = value
            const view = select.ownerDocument.defaultView as unknown as typeof globalThis
            select.dispatchEvent(new view.Event(`change`, { bubbles: true }))
          })
        }
        const secondName = () =>
          root.querySelector<HTMLSelectElement>(`[data-e2e="second-list-select"]`)
            ?.selectedOptions[0]
            ?.text
        expect(secondName()).toBe(`Home`)
        await pick(`main-list-select`, `/dav/tasks/work/`)
        expect(history.at(-1)).toBe(`/lists/work`)
        expect(secondName()).toBe(`Home`)
        // Work is now the main list; picking Home, the second, puts Work on the right.
        await pick(`main-list-select`, `/dav/tasks/home/`)
        expect(history.at(-1)).toBe(`/lists/home`)
        expect(secondName()).toBe(`Work`)
      },
    )
  })
})
