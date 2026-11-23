/// <reference lib="deno.ns" />
import "fake-indexeddb/auto"
import { expect } from "@std/expect"
import { act } from "preact/test-utils"
import { LIST_HREF } from "@tasks/fixtures/tasksorg.ts"
import { mount, must } from "@ui/mount.test.tsx"
import { refresh } from "../state/sync.ts"
import { withApp } from "../state/testing.ts"
import { SidebarView } from "./SidebarView.tsx"

const PARENT = [
  `BEGIN:VCALENDAR`,
  `VERSION:2.0`,
  `PRODID:test`,
  `BEGIN:VTODO`,
  `UID:groceries`,
  `DTSTAMP:20261001T000000Z`,
  `SUMMARY:Groceries`,
  `STATUS:NEEDS-ACTION`,
  `END:VTODO`,
  `END:VCALENDAR`,
  ``,
].join(`\r\n`)

Deno.test(`one Enter on a suggested main task adds the new task under it`, async () => {
  await withApp(async (server) => {
    server.calendarList = [{ href: LIST_HREF, displayName: `Daily`, changeMarker: `c1` }]
    server.seed(`${LIST_HREF}g.ics`, LIST_HREF, PARENT)
    await refresh()
    await mount(
      <SidebarView compact currentPath="/lists/daily" navigate={() => {}} />,
      async ({ root, window }) => {
        const field = must<HTMLTextAreaElement>(root, `[data-e2e="new-task-title"]`)
        const key = (k: string) =>
          act(async () => {
            field.dispatchEvent(
              new window.KeyboardEvent(`keydown`, { key: k, bubbles: true }) as never,
            )
            await new Promise((resolve) => setTimeout(resolve, 50))
          })
        await act(() => {
          field.focus()
          field.value = `Milk / Gro`
          field.dispatchEvent(new window.Event(`input`, { bubbles: true }) as never)
        })
        expect(root.querySelector(`[data-e2e="new-task-parent-menu"]`)).not.toBeNull()
        await key(`Enter`)
        await new Promise((resolve) => setTimeout(resolve, 200))
        const milk = [...server.objects.values()].map((o) => o.ics).find((ics) =>
          /^SUMMARY:Milk\s*$/m.test(ics)
        )
        expect(milk).toBeDefined()
        expect(milk).toContain(`RELATED-TO`)
        expect(milk).toContain(`groceries`)
      },
    )
  })
})
