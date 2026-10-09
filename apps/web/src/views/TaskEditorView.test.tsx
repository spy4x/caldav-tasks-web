/// <reference lib="deno.ns" />
import "fake-indexeddb/auto"
import { expect } from "@std/expect"
import { act } from "preact/test-utils"
import { memoryLocation } from "wouter-preact/memory-location"
import { Route, Router } from "wouter-preact"
import { LIST_HREF, task as fixture } from "@tasks/fixtures/tasksorg.ts"
import { must } from "@ui/mount.test.tsx"
import { onPage } from "./on-page.test.tsx"
import { refresh } from "../state/sync.ts"
import { tasks } from "../state/tasks.ts"
import { withApp } from "../state/testing.ts"
import type { FakeServer } from "../state/testing.ts"
import { ROUTES } from "../routes.ts"
import { TaskEditorView } from "./TaskEditorView.tsx"

const HREF = `${LIST_HREF}one.ics`

async function start(server: FakeServer, rest: string[] = []) {
  server.calendarList = [{ href: LIST_HREF, displayName: `Errands`, changeMarker: `c1` }]
  server.seed(HREF, LIST_HREF, fixture(`1`, `Buy milk`, rest))
  await refresh()
}

function editor() {
  const { hook } = memoryLocation({ path: `/tasks/1` })
  return (
    <Router hook={hook}>
      <Route path={ROUTES.task}>
        <TaskEditorView />
      </Route>
    </Router>
  )
}

const e2e = <T extends Element>(root: ParentNode, name: string) =>
  must<T>(root, `[data-e2e="${name}"]`)

async function type(root: ParentNode, name: string, value: string) {
  const input = e2e<HTMLInputElement>(root, name)
  await act(() => {
    input.value = value
    input.dispatchEvent(
      new (input.ownerDocument.defaultView!.Event as typeof Event)(`input`, { bubbles: true }),
    )
  })
}

async function press(root: ParentNode, name: string) {
  const button = e2e<HTMLElement>(root, name)
  await act(async () => {
    button.click()
    // `EnhancedForm` calls `onSubmit` one microtask after the submit event.
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  await settled()
}

/** Lets the save finish: the fake server and the fake IndexedDB answer on later ticks. */
async function settled() {
  for (let i = 0; i < 20; i++) await act(() => new Promise((resolve) => setTimeout(resolve, 5)))
}

Deno.test(`the editor lists a reminder at a fixed moment in the browser's zone`, async () => {
  const resolved = Intl.DateTimeFormat.prototype.resolvedOptions
  // The zone the person's browser reports; the test machine's own zone must not matter.
  Intl.DateTimeFormat.prototype.resolvedOptions = function () {
    return { ...resolved.call(this), timeZone: `Asia/Ho_Chi_Minh` }
  }
  try {
    await withApp(async (server) => {
      await start(server, [
        `BEGIN:VALARM`,
        `ACTION:DISPLAY`,
        `DESCRIPTION:Reminder`,
        `TRIGGER;VALUE=DATE-TIME:20261010T080000Z`,
        `END:VALARM`,
      ])
      await onPage(editor(), ({ root }) => {
        // 08:00 UTC is 15:00 in Ho Chi Minh City.
        expect(must(root, `#task-reminders-heading`).parentElement?.textContent).toContain(`15:00`)
        return Promise.resolve()
      })
    })
  } finally {
    Intl.DateTimeFormat.prototype.resolvedOptions = resolved
  }
})

Deno.test(`Keep mine after a conflict sends the form as it stands now, not as it collided`, async () => {
  await withApp(async (server) => {
    await start(server)
    const stored = server.objects.get(HREF)!
    await onPage(editor(), async ({ root }) => {
      await type(root, `task-title`, `Buy oat milk`)
      // Another client renames the task before Save, so the same field has changed on both sides.
      server.objects.set(HREF, {
        ...stored,
        etag: server.nextEtag(),
        ics: stored.ics.replace(`SUMMARY:Buy milk`, `SUMMARY:Buy cheese`),
      })
      await press(root, `task-save`)
      expect(tasks.value[0].title).toBe(`Buy cheese`)
      // The dialog is open and the form still holds what was typed. Retyping changes it.
      await type(root, `task-title`, `Final title`)

      await press(root, `task-conflict-keep-mine`)

      const onServer = server.objects.get(HREF)!.ics
      expect(onServer).toContain(`SUMMARY:Final title`)
      expect(onServer).not.toContain(`SUMMARY:Buy oat milk`)
    })
  })
})
