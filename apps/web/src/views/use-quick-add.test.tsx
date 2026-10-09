/// <reference lib="deno.ns" />
import "fake-indexeddb/auto"
import { expect } from "@std/expect"
import { act } from "preact/test-utils"
import { LIST_HREF } from "@tasks/fixtures/tasksorg.ts"
import { mount } from "@ui/mount.test.tsx"
import { refresh } from "../state/sync.ts"
import { withApp } from "../state/testing.ts"
import { isoDateInTz } from "@spy4x/time/tz"
import { browserZone } from "./clock.ts"
import { quickAddTarget, useQuickAdd } from "./use-quick-add.ts"

const LISTS = [{ href: `/a/` }, { href: `/b/` }]

Deno.test(`a quick add with no list named goes to the first list`, () => {
  expect(quickAddTarget(LISTS, true)).toEqual({ listHref: `/a/` })
})

Deno.test(`a quick add in a named list goes there`, () => {
  expect(quickAddTarget(LISTS, true, `/b/`)).toEqual({ listHref: `/b/` })
})

Deno.test(`a quick add before the lists have loaded says they are loading`, () => {
  expect(quickAddTarget([], false)).toEqual({
    error: `Your lists are still loading. Try again in a moment.`,
  })
})

Deno.test(`a quick add with no lists at all says there is none`, () => {
  expect(quickAddTarget([], true)).toEqual({ error: `There is no list to add the task to yet.` })
})

Deno.test(`a quick add from Today creates the task due today in the browser's zone`, async () => {
  await withApp(async (server) => {
    server.calendarList = [{ href: LIST_HREF, displayName: `Errands`, changeMarker: `c1` }]
    await refresh()
    let add: (title: string) => Promise<void> = () => Promise.resolve()
    function Today() {
      add = useQuickAdd({ dueToday: true }).add
      return null
    }
    const before = isoDateInTz(new Date(), browserZone())
    await mount(<Today />, async () => {
      await act(() => add(`Pay the rent`))
    })
    const after = isoDateInTz(new Date(), browserZone())

    const created = [...server.objects.values()].map((object) => object.ics)
    expect(created).toHaveLength(1)
    expect(created[0]).toContain(`SUMMARY:Pay the rent`)
    // A run that straddles midnight may land on either day.
    const dues = new Set([before, after].map((day) => `DUE;VALUE=DATE:${day.replaceAll(`-`, ``)}`))
    expect(dues.has(/^DUE;VALUE=DATE:\d+$/m.exec(created[0])?.[0] ?? ``)).toBe(true)
  })
})
