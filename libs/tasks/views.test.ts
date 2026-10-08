/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { IcalDateKind } from "@spy4x/time/ical"
import { dateDay } from "./model.ts"
import { COMPLETED, DUE_KINDS, ERRANDS, fixtureTask, task } from "./fixtures/tasksorg.ts"
import { isOverdue, todayView, upcomingView } from "./views.ts"
import type { Task } from "./types.ts"

const UTC = `UTC`
const HO_CHI_MINH = `Asia/Ho_Chi_Minh`
const AUCKLAND = `Pacific/Auckland`
const LOS_ANGELES = `America/Los_Angeles`

const dated = (uid: string, due: string) => fixtureTask(task(uid, `Task ${uid}`, [due]))
const uids = (tasks: Task[]) => tasks.map((t) => t.uid)

Deno.test("a date-only due is today for the whole day and overdue the day after, in UTC", () => {
  const due = dated(`1`, `DUE;VALUE=DATE:20261008`)
  const at = (iso: string) => todayView([due], new Date(iso), UTC)
  expect(uids(at(`2026-10-07T23:59:59Z`).today)).toEqual([])
  expect(uids(at(`2026-10-08T00:00:00Z`).today)).toEqual([`1`])
  expect(uids(at(`2026-10-08T23:59:59Z`).today)).toEqual([`1`])
  expect(uids(at(`2026-10-08T23:59:59Z`).overdue)).toEqual([])
  expect(uids(at(`2026-10-09T00:00:00Z`).overdue)).toEqual([`1`])
  expect(uids(at(`2026-10-09T00:00:00Z`).today)).toEqual([])
})

Deno.test("a date-only due follows the viewer's day, east and west of UTC", () => {
  const due = dated(`1`, `DUE;VALUE=DATE:20261008`)
  // 2026-10-08T00:00Z is 13:00 on the 8th in Auckland and 17:00 on the 7th in Los Angeles.
  const instant = new Date(`2026-10-08T00:00:00Z`)
  expect(uids(todayView([due], instant, AUCKLAND).today)).toEqual([`1`])
  expect(uids(todayView([due], instant, LOS_ANGELES).today)).toEqual([])
  expect(upcomingView([due], instant, LOS_ANGELES)[0].date).toBe(`2026-10-08`)
  // 2026-10-08T11:00Z is already the 9th in Auckland, still the 8th in UTC.
  const later = new Date(`2026-10-08T11:00:00Z`)
  expect(uids(todayView([due], later, AUCKLAND).overdue)).toEqual([`1`])
  expect(uids(todayView([due], later, UTC).today)).toEqual([`1`])
})

Deno.test("a floating due keeps its wall clock in the viewer's zone", () => {
  const due = fixtureTask(DUE_KINDS.floating) // 23:30 on the 8th
  const view = (iso: string, zone: string) => todayView([due], new Date(iso), zone)
  // 11:00Z is 00:00 on the 9th in Auckland: past 23:30. In UTC it is 11:00 on the 8th.
  expect(uids(view(`2026-10-08T11:00:00Z`, AUCKLAND).overdue)).toEqual(
    [`100200311`],
  )
  expect(uids(view(`2026-10-08T11:00:00Z`, UTC).today)).toEqual([`100200311`])
  expect(uids(view(`2026-10-08T11:00:00Z`, UTC).overdue)).toEqual([])
})

Deno.test("a zoned due viewed from UTC lands on the UTC day of its instant", () => {
  // 03:00 on the 9th in Ho Chi Minh is 20:00 on the 8th in UTC.
  const due = fixtureTask(
    task(
      `1`,
      `Early`,
      [`DUE;TZID=Asia/Ho_Chi_Minh:20261009T030000`],
    ).replace(
      `END:VCALENDAR`,
      `BEGIN:VTIMEZONE\r\nTZID:Asia/Ho_Chi_Minh\r\nEND:VTIMEZONE\r\nEND:VCALENDAR`,
    ),
  )
  expect(dateDay(due.due!, UTC)).toBe(`2026-10-08`)
  expect(dateDay(due.due!, HO_CHI_MINH)).toBe(`2026-10-09`)
  expect(dateDay(due.due!, LOS_ANGELES)).toBe(`2026-10-08`)
  const now = new Date(`2026-10-08T10:00:00Z`)
  expect(uids(todayView([due], now, UTC).today)).toEqual([`1`])
  expect(uids(todayView([due], now, HO_CHI_MINH).today)).toEqual([])
  expect(upcomingView([due], now, HO_CHI_MINH)[0].date).toBe(`2026-10-09`)
})

Deno.test("a UTC due is shifted into the viewer's day", () => {
  const due = fixtureTask(DUE_KINDS.utc) // 23:30Z on the 8th, 06:30 on the 9th in Ho Chi Minh
  expect(dateDay(due.due!, UTC)).toBe(`2026-10-08`)
  expect(dateDay(due.due!, HO_CHI_MINH)).toBe(`2026-10-09`)
  const now = new Date(`2026-10-08T10:00:00Z`)
  expect(uids(todayView([due], now, UTC).today)).toEqual([`100200312`])
  expect(upcomingView([due], now, HO_CHI_MINH).map((day) => day.date)).toEqual([`2026-10-09`])
})

Deno.test("a timed due is overdue the moment it passes, later the same day", () => {
  const due = fixtureTask(DUE_KINDS.utc)
  expect(isOverdue(due.due!, new Date(`2026-10-08T23:29:59Z`), UTC)).toBe(false)
  expect(isOverdue(due.due!, new Date(`2026-10-08T23:30:00Z`), UTC)).toBe(false)
  expect(isOverdue(due.due!, new Date(`2026-10-08T23:30:01Z`), UTC)).toBe(true)
  const view = todayView([due], new Date(`2026-10-08T23:45:00Z`), UTC)
  expect(uids(view.overdue)).toEqual([`100200312`])
  expect(uids(view.today)).toEqual([])
})

Deno.test("a zoned due with a zone name the runtime does not know is read in the viewer's zone", () => {
  const due = {
    kind: IcalDateKind.Zoned,
    date: `2026-10-08`,
    time: `10:00:00`,
    tzid: `W. Europe Standard Time`,
  }
  expect(dateDay(due, UTC)).toBe(`2026-10-08`)
  expect(isOverdue(due, new Date(`2026-10-08T09:00:00Z`), UTC)).toBe(false)
  expect(isOverdue(due, new Date(`2026-10-08T11:00:00Z`), UTC)).toBe(true)
})

Deno.test("Today lists overdue tasks earliest first and leaves out done and undated tasks", () => {
  const all = [
    dated(`late`, `DUE;VALUE=DATE:20261005`),
    dated(`later`, `DUE;VALUE=DATE:20261007`),
    dated(`today`, `DUE;VALUE=DATE:20261008`),
    dated(`tomorrow`, `DUE;VALUE=DATE:20261009`),
    fixtureTask(COMPLETED),
    fixtureTask(ERRANDS[`100200300`]),
  ]
  const view = todayView([all[1], all[0], ...all.slice(2)], new Date(`2026-10-08T09:00:00Z`), UTC)
  expect(uids(view.overdue)).toEqual([`late`, `later`])
  expect(uids(view.today)).toEqual([`today`])
})

Deno.test("Upcoming reaches tomorrow through 14 days ahead and skips empty days", () => {
  const now = new Date(`2026-10-08T09:00:00Z`)
  const all = [
    dated(`today`, `DUE;VALUE=DATE:20261008`),
    dated(`d1`, `DUE;VALUE=DATE:20261009`),
    dated(`d1b`, `DUE:20261009T080000Z`),
    dated(`d14`, `DUE;VALUE=DATE:20261022`),
    dated(`d15`, `DUE;VALUE=DATE:20261023`),
    dated(`d3`, `DUE;VALUE=DATE:20261011`),
    dated(`past`, `DUE;VALUE=DATE:20261001`),
    fixtureTask(COMPLETED),
  ]
  const days = upcomingView(all, now, UTC)
  expect(days.map((day) => day.date)).toEqual([`2026-10-09`, `2026-10-11`, `2026-10-22`])
  // The date-only task starts at midnight, so it comes before the 08:00 one.
  expect(uids(days[0].tasks)).toEqual([`d1`, `d1b`])
})

Deno.test("Upcoming counts its 14 days from the viewer's today", () => {
  const due = dated(`1`, `DUE;VALUE=DATE:20261022`)
  // Los Angeles is still on the 7th: the window ends on the 21st.
  expect(upcomingView([due], new Date(`2026-10-08T03:00:00Z`), LOS_ANGELES)).toEqual([])
  expect(upcomingView([due], new Date(`2026-10-08T03:00:00Z`), UTC).length).toBe(1)
})
