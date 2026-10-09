/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { dateOnly, dateTime } from "./task-fixtures.ts"
import { dayLabel, dueLabel, DueTone } from "./due-label.ts"

const NOW = new Date(`2026-10-08T09:00:00Z`)

Deno.test("a day is Yesterday, Today or Tomorrow near today and weekday, day and month otherwise", () => {
  expect(dayLabel(`2026-10-07`, `2026-10-08`, `UTC`)).toBe(`Yesterday`)
  expect(dayLabel(`2026-10-08`, `2026-10-08`, `UTC`)).toBe(`Today`)
  expect(dayLabel(`2026-10-09`, `2026-10-08`, `UTC`)).toBe(`Tomorrow`)
  expect(dayLabel(`2026-10-15`, `2026-10-08`, `UTC`)).toBe(`Thu 15 Oct`)
  expect(dayLabel(`2026-10-05`, `2026-10-08`, `UTC`)).toBe(`Mon 5 Oct`)
})

Deno.test("a due date is overdue from the day after, a due time the moment it passes", () => {
  expect(dueLabel(dateOnly(`2026-10-07`)!, NOW, `UTC`)).toEqual({
    text: `Yesterday`,
    tone: DueTone.Overdue,
  })
  expect(dueLabel(dateOnly(`2026-10-08`)!, NOW, `UTC`)).toEqual({
    text: `Today`,
    tone: DueTone.Today,
  })
  expect(dueLabel(dateTime(`2026-10-08`, `07:30:00`)!, NOW, `UTC`)).toEqual({
    text: `Today 07:30`,
    tone: DueTone.Overdue,
  })
  expect(dueLabel(dateTime(`2026-10-08`, `14:00:00`)!, NOW, `UTC`)).toEqual({
    text: `Today 14:00`,
    tone: DueTone.Today,
  })
  expect(dueLabel(dateOnly(`2026-10-10`)!, NOW, `UTC`)).toEqual({
    text: `Sat 10 Oct`,
    tone: DueTone.Normal,
  })
})

Deno.test("days are counted in the viewer's zone", () => {
  // 23:30 UTC on the 8th is already the 9th in Ho Chi Minh City.
  const late = new Date(`2026-10-08T23:30:00Z`)
  expect(dueLabel(dateOnly(`2026-10-09`)!, late, `Asia/Ho_Chi_Minh`).text).toBe(`Today`)
  expect(dueLabel(dateOnly(`2026-10-09`)!, late, `UTC`).text).toBe(`Tomorrow`)
})
