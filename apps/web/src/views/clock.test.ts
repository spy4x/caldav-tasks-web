/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { todayIn } from "./clock.ts"

Deno.test(`today is the date in the person's zone, not in UTC`, () => {
  const instant = new Date(`2026-10-09T23:30:00Z`)
  expect(todayIn(`UTC`, instant)).toBe(`2026-10-09`)
  expect(todayIn(`Asia/Ho_Chi_Minh`, instant)).toBe(`2026-10-10`)
  expect(todayIn(`America/Los_Angeles`, instant)).toBe(`2026-10-09`)
})
