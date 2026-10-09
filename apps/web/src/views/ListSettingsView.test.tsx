/// <reference lib="deno.ns" />
import "fake-indexeddb/auto"
import { expect } from "@std/expect"
import { act } from "preact/test-utils"
import { memoryLocation } from "wouter-preact/memory-location"
import { Route, Router } from "wouter-preact"
import { LIST_HOLDS_EVENTS } from "@api/caldav.ts"
import { LIST_HREF, task as fixture } from "@tasks/fixtures/tasksorg.ts"
import { onPage } from "./on-page.test.tsx"
import { refresh } from "../state/sync.ts"
import { error, type FakeServer, withApp } from "../state/testing.ts"
import { ROUTES } from "../routes.ts"
import { ListSettingsView } from "./ListSettingsView.tsx"

/** A list with one open task and two completed ones, which the first sync does not fetch. */
async function start(server: FakeServer, components?: string[]) {
  server.calendarList = [
    { href: LIST_HREF, displayName: `Errands`, changeMarker: `c1`, components },
  ]
  server.seed(`${LIST_HREF}one.ics`, LIST_HREF, fixture(`1`, `Buy milk`))
  for (const uid of [`2`, `3`]) {
    server.seed(
      `${LIST_HREF}${uid}.ics`,
      LIST_HREF,
      fixture(uid, `Done ${uid}`, [`STATUS:COMPLETED`]),
      true,
    )
  }
  await refresh()
}

function settings() {
  const { hook } = memoryLocation({ path: `/lists/errands/settings` })
  return (
    <Router hook={hook}>
      <Route path={ROUTES.listSettings}>
        <ListSettingsView />
      </Route>
    </Router>
  )
}

/** Holds back every request for completed tasks until `release` is called. */
function holdCompleted(): { release: () => void; restore: () => void } {
  let release!: () => void
  const gate = new Promise<void>((resolve) => release = resolve)
  const own = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url.includes(`completed=true`)) await gate
    return own(input, init)
  }
  return { release, restore: () => globalThis.fetch = own }
}

/** Lets the fake server and the fake IndexedDB answer: they do so on later ticks. */
async function settled() {
  for (let i = 0; i < 20; i++) await act(() => new Promise((resolve) => setTimeout(resolve, 5)))
}

const find = (root: ParentNode, name: string) =>
  root.querySelector(`[data-e2e="${name}"]`) as HTMLButtonElement | null

async function click(element: HTMLElement | null) {
  if (!element) throw new Error(`nothing to click`)
  await act(() => element.click())
}

/** Opens More actions and asks to delete, then returns the question the dialog shows. */
async function askToDelete(root: ParentNode, document: Document): Promise<string> {
  await click(find(root, `list-menu`))
  await click(find(root, `list-delete`))
  return document.querySelector(`[data-e2e="list-delete-dialog"] h2`)?.textContent ?? ``
}

Deno.test(`Delete waits for the completed tasks, then counts them in the question`, async () => {
  await withApp(async (server) => {
    await start(server)
    const held = holdCompleted()
    try {
      await onPage(settings(), async ({ root, window }) => {
        await settled()
        await click(find(root, `list-menu`))
        // Only the open task is known yet: a count now would say 1 instead of 3.
        expect(find(root, `list-delete`)?.disabled).toBe(true)
        held.release()
        await settled()
        const question = await askToDelete(root, window.document as unknown as Document)
        expect(question).toBe(`Delete Errands and its 3 tasks?`)
      })
    } finally {
      held.restore()
    }
  })
})

Deno.test(`when the completed tasks cannot be loaded, the question names no number`, async () => {
  await withApp(async (server) => {
    await start(server)
    const own = globalThis.fetch
    globalThis.fetch = (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.includes(`completed=true`)) {
        return Promise.resolve(error(502, `caldav_failed`, `The CalDAV server failed`))
      }
      return own(input, init)
    }
    try {
      await onPage(settings(), async ({ root, window }) => {
        await settled()
        const question = await askToDelete(root, window.document as unknown as Document)
        expect(question).toBe(`Delete Errands and all its tasks?`)
      })
    } finally {
      globalThis.fetch = own
    }
  })
})

Deno.test(`a list that may also hold events offers no Delete and says where to delete it`, async () => {
  for (const components of [[`VEVENT`, `VTODO`], []]) {
    await withApp(async (server) => {
      await start(server, components)
      await onPage(settings(), async ({ root }) => {
        await settled()
        // Compared as a boolean: a failing diff of a page element overflows the stack.
        expect(find(root, `list-menu`) === null).toBe(true)
        expect(find(root, `list-holds-events`)?.textContent).toBe(LIST_HOLDS_EVENTS)
        expect(find(root, `list-save`)?.disabled).toBe(false)
      })
    })
  }
})
