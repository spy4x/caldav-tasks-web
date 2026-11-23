/// <reference lib="deno.ns" />
import "fake-indexeddb/auto"
import { expect } from "@std/expect"
import { act } from "preact/test-utils"
import { LIST_HREF } from "@tasks/fixtures/tasksorg.ts"
import { mount, must } from "@ui/mount.test.tsx"
import { refresh } from "../state/sync.ts"
import { withApp } from "../state/testing.ts"
import { SidebarView } from "./SidebarView.tsx"
import { PATHS } from "@ui/frame.tsx"
import { browserZone } from "./clock.ts"

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

Deno.test(`on Today, a task added from the sidebar with no date is due today`, async () => {
  await withApp(async (server) => {
    server.calendarList = [{ href: LIST_HREF, displayName: `Daily`, changeMarker: `c1` }]
    await refresh()
    await mount(
      <SidebarView currentPath={PATHS.today} navigate={() => {}} />,
      async ({ root, window }) => {
        const field = must<HTMLTextAreaElement>(root, `[data-e2e="new-task-title"]`)
        expect(field.getAttribute(`placeholder`)).toBe(`Add a task for today…`)
        await act(async () => {
          field.value = `Call the bank`
          field.dispatchEvent(new window.Event(`input`, { bubbles: true }) as never)
        })
        await act(async () => {
          field.dispatchEvent(
            new window.KeyboardEvent(`keydown`, { key: `Enter`, bubbles: true }) as never,
          )
          await new Promise((resolve) => setTimeout(resolve, 200))
        })
        const today = new Date().toLocaleDateString(`en-CA`, { timeZone: browserZone() })
          .replaceAll(`-`, ``)
        const ics = [...server.objects.values()].map((o) => o.ics).find((text) =>
          /^SUMMARY:Call the bank\s*$/m.test(text)
        )
        expect(ics).toMatch(new RegExp(String.raw`^DUE;VALUE=DATE:${today}\s*$`, `m`))
      },
    )
  })
})
