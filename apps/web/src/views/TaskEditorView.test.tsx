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

async function choose(root: ParentNode, name: string, value: string) {
  const select = e2e<HTMLSelectElement>(root, name)
  await act(() => {
    select.value = value
    select.dispatchEvent(
      new (select.ownerDocument.defaultView!.Event as typeof Event)(`change`, { bubbles: true }),
    )
  })
}

const DUE = `DUE;VALUE=DATE:20261012`

Deno.test(`a repeat and a reminder set in the editor reach the server, and removing them takes them away`, async () => {
  await withApp(async (server) => {
    await start(server, [DUE, `X-KEEP:still here`])
    await onPage(editor(), async ({ root }) => {
      await choose(root, `task-repeat-freq`, `2`)
      await choose(root, `task-reminders-unit`, `H`)
      await type(root, `task-reminders-amount`, `1`)
      await press(root, `task-reminder-add`)
      await press(root, `task-save`)
    })
    const written = server.objects.get(HREF)!.ics
    expect(written).toContain(`RRULE:FREQ=WEEKLY;INTERVAL=1`)
    expect(written).toContain(`TRIGGER;RELATED=END:-PT1H`)
    // The reminder Tasks.org wrote and the property this app does not know are still there.
    expect(written).toContain(`TRIGGER;RELATED=END:PT0S`)
    expect(written).toContain(`X-KEEP:still here`)

    await onPage(editor(), async ({ root }) => {
      expect(e2e<HTMLSelectElement>(root, `task-repeat-freq`).value).toBe(`2`)
      expect(root.querySelectorAll(`[data-e2e="task-reminder"]`)).toHaveLength(2)
      await choose(root, `task-repeat-freq`, `none`)
      for (let left = 2; left > 0; left--) await press(root, `task-reminder-remove`)
      await press(root, `task-save`)
    })
    const cleared = server.objects.get(HREF)!.ics
    expect(cleared).not.toContain(`RRULE`)
    expect(cleared).not.toContain(`VALARM`)
    expect(cleared).toContain(`X-KEEP:still here`)
  })
})

Deno.test(`a repeat changed on both sides is a conflict, and Keep mine writes the repeat from the form`, async () => {
  await withApp(async (server) => {
    await start(server, [DUE, `RRULE:FREQ=DAILY;INTERVAL=1`])
    const stored = server.objects.get(HREF)!
    await onPage(editor(), async ({ root }) => {
      await choose(root, `task-repeat-freq`, `3`)
      server.objects.set(HREF, {
        ...stored,
        etag: server.nextEtag(),
        ics: stored.ics.replace(`RRULE:FREQ=DAILY;INTERVAL=1`, `RRULE:FREQ=YEARLY;INTERVAL=1`),
      })
      await press(root, `task-save`)
      expect(server.objects.get(HREF)!.ics).toContain(`FREQ=YEARLY`)
      await press(root, `task-conflict-keep-mine`)
      expect(server.objects.get(HREF)!.ics).toContain(`RRULE:FREQ=MONTHLY;INTERVAL=1`)
    })
  })
})

Deno.test(`a repeat set here is kept when another client changed only the title`, async () => {
  await withApp(async (server) => {
    await start(server, [DUE])
    const stored = server.objects.get(HREF)!
    await onPage(editor(), async ({ root }) => {
      await choose(root, `task-repeat-freq`, `1`)
      server.objects.set(HREF, {
        ...stored,
        etag: server.nextEtag(),
        ics: stored.ics.replace(`SUMMARY:Buy milk`, `SUMMARY:Buy cheese`),
      })
      await press(root, `task-save`)
      const merged = server.objects.get(HREF)!.ics
      expect(merged).toContain(`SUMMARY:Buy cheese`)
      expect(merged).toContain(`RRULE:FREQ=DAILY;INTERVAL=1`)
    })
  })
})
