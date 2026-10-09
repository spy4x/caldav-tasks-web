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
import { parseQuickAdd, type QuickAddResult } from "@spy4x/platform"
import { IcalDateKind } from "@spy4x/time/ical"
import { newTaskFromQuickAdd, quickAddTarget, useQuickAdd } from "./use-quick-add.ts"

const ZONE = `Asia/Ho_Chi_Minh`
// Saturday 10 October 2026, 19:00 in Ho Chi Minh (UTC+7).
const NOW = new Date(`2026-10-10T12:00:00Z`)
const parse = (line: string) => parseQuickAdd(line, { now: NOW, timeZone: ZONE })
const fields = (line: string, dueToday = false) =>
  newTaskFromQuickAdd(parse(line), { dueToday, now: NOW, zone: ZONE })

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
    let add: (parsed: QuickAddResult) => Promise<void> = () => Promise.resolve()
    function Today() {
      add = useQuickAdd({ dueToday: true }).add
      return null
    }
    const before = isoDateInTz(new Date(), browserZone())
    await mount(<Today />, async () => {
      await act(() => add(parse(`Pay the rent`)))
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

Deno.test(`a line with tag, time and priority becomes those fields, the time saved as UTC`, () => {
  expect(fields(`Call Anna #work tomorrow 3pm !high`)).toEqual({
    title: `Call Anna`,
    tags: [`work`],
    due: { kind: IcalDateKind.Utc, date: `2026-10-11`, time: `08:00:00` },
    priority: 1,
  })
})

Deno.test(`the three priority words map to 1, 5 and 9`, () => {
  expect([`high`, `medium`, `low`].map((word) => fields(`Task !${word}`).priority)).toEqual([
    1,
    5,
    9,
  ])
})

Deno.test(`a date with no time is a whole-day due`, () => {
  expect(fields(`Pay rent in 3 days`).due).toEqual({ kind: IcalDateKind.Date, date: `2026-10-13` })
})

Deno.test(`a time late in the evening lands on the next UTC day only when the zone says so`, () => {
  // 01:30 in Ho Chi Minh on the 11th is 18:30 UTC on the 10th.
  expect(fields(`Wake up tomorrow 1:30am`).due).toEqual({
    kind: IcalDateKind.Utc,
    date: `2026-10-10`,
    time: `18:30:00`,
  })
})

Deno.test(`Today dates a task with no typed date today, and a typed date wins`, () => {
  expect(fields(`Pay rent`, true).due).toEqual({ kind: IcalDateKind.Date, date: `2026-10-10` })
  expect(fields(`Pay rent tomorrow`, true).due).toEqual({
    kind: IcalDateKind.Date,
    date: `2026-10-11`,
  })
})

Deno.test(`a plain title carries no tags, due or priority`, () => {
  expect(fields(`Buy oat milk`)).toEqual({ title: `Buy oat milk` })
})

Deno.test(`an @context is kept as a tag so no typed word is lost`, () => {
  expect(fields(`Plan @work/meetings #q4`).tags).toEqual([`q4`, `work/meetings`])
})
